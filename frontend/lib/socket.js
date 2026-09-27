"use client";

import { io } from "socket.io-client";

import { AUTH_CHANGE_EVENT, getToken } from "./api";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// One socket per browser tab, shared by every screen that listens. The messages
// page is the only consumer, but recreating the connection per component would
// open a second WebSocket and duplicate every broadcast the user receives.
let socket = null;

// The token the live socket handshook with. A socket authenticates once, at
// connect: every event it carries is attributed to the user in that JWT, so it
// has to be dropped whenever the stored token stops matching. Without this, a tab
// that signs out and back in as somebody else keeps sending as its first user —
// the REST calls follow localStorage while the socket does not, and messages land
// attributed to the previous account.
let socketToken = null;

export const getSocket = () => {
  if (typeof window === "undefined") {
    return null;
  }

  if (socket && socketToken !== getToken()) {
    disconnectSocket();
  }

  if (socket) {
    return socket;
  }

  socketToken = getToken();

  socket = io(SOCKET_URL, {
    path: "/socket.io",
    // realtime/index.js reads the JWT from the handshake because the browser
    // WebSocket API cannot set an Authorization header. A function, not a value:
    // socket.io reuses `auth` for every reconnect, so a token read once here
    // would be replayed for the life of the tab.
    auth: (callback) => callback({ token: getToken() }),
    transports: ["websocket", "polling"],
    autoConnect: false,
  });

  return socket;
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
  socketToken = null;
};

// Eagerly drop the connection on a token change instead of waiting for the next
// getSocket() call, so a signed-out tab is not left holding a live authenticated
// socket and still receiving broadcasts.
const dropSocketOnTokenChange = () => {
  if (socket && socketToken !== getToken()) {
    disconnectSocket();
  }
};

if (typeof window !== "undefined") {
  // Same-tab sign-in and sign-out, plus the `storage` event for either one
  // happening in another tab of the same browser.
  window.addEventListener(AUTH_CHANGE_EVENT, dropSocketOnTokenChange);
  window.addEventListener("storage", dropSocketOnTokenChange);
}

// The backend answers every command with an ack rather than an event, so a
// rejected send is a resolved promise carrying the error instead of a throw that
// would have to be caught inside the socket callback.
export const emitWithAck = (socketInstance, event, payload) =>
  new Promise((resolve, reject) => {
    socketInstance.emit(event, payload ?? {}, (response) => {
      if (response?.ok) {
        resolve(response.data);
        return;
      }

      reject(
        Object.assign(
          new Error(response?.error?.message ?? "The server rejected the request"),
          { status: response?.error?.statusCode },
        ),
      );
    });
  });

export const SOCKET_EVENTS = {
  ready: "connection:ready",
  threadJoin: "thread:join",
  threadLeave: "thread:leave",
  messageSend: "message:send",
  threadRead: "thread:read",
  unreadCount: "unread:count",
  messageNew: "message:new",
  threadReadBroadcast: "thread:read",
  unreadRefresh: "unread:refresh",
};
