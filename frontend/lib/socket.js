"use client";

import { io } from "socket.io-client";

import { getToken } from "./api";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

// One socket per browser tab, shared by every screen that listens. The messages
// page is the only consumer, but recreating the connection per component would
// open a second WebSocket and duplicate every broadcast the user receives.
let socket = null;

export const getSocket = () => {
  if (typeof window === "undefined") {
    return null;
  }

  if (socket) {
    return socket;
  }

  socket = io(SOCKET_URL, {
    path: "/socket.io",
    // realtime/index.js reads the JWT from the handshake because the browser
    // WebSocket API cannot set an Authorization header.
    auth: { token: getToken() },
    transports: ["websocket", "polling"],
    autoConnect: false,
  });

  return socket;
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};

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
