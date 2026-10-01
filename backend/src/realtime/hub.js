// Single mutable reference to the socket.io server, plus the room-name scheme.
//
// This module deliberately imports nothing from src/modules. The alternative — a
// message service importing the realtime server to emit, while the realtime server
// imports the message service to handle events — is a require/import cycle. Keeping
// the hub inert breaks it: services import the emitters, the socket layer imports
// the services, and neither imports the other.
//
//   user:<userId>            every socket belonging to one account, across devices
//   thread:<staff>:<admin>:<issue|general>
//                            one chat thread; see message.service for the key
//
// A user's own sockets join `user:<id>` automatically on connect. Thread rooms are
// joined on demand via the thread:join event, so an admin who is not looking at a
// conversation costs nothing.

let io = null;

export const setIo = (server) => {
  io = server;
};

// issue_id is nullable on messages, and NULL is the key for a general staff<->admin
// thread with no issue context. A room name cannot contain a real NULL, so this
// sentinel stands in for it and round-trips through the same normalisation the SQL
// uses.
const GENERAL_THREAD = 'general';

export const threadRoom = (staffId, adminId, issueId) =>
  `thread:${staffId}:${adminId}:${issueId ?? GENERAL_THREAD}`;

export const userRoom = (userId) => `user:${userId}`;

export const emitToUser = (userId, event, payload) => {
  io?.to(userRoom(userId)).emit(event, payload);
};

export const emitToThread = (staffId, adminId, issueId, event, payload) => {
  io?.to(threadRoom(staffId, adminId, issueId)).emit(event, payload);
};

// Everyone who could plausibly be watching a thread: both participants on all their
// devices, whether or not they joined the room.
export const emitToParticipants = ({ staffId, adminId, issueId }, event, payload) => {
  emitToUser(adminId, event, payload);
  emitToThread(staffId, adminId, issueId, event, payload);
};

// Hard eviction, used when an account is deactivated. A socket is authenticated once
// at connect, so refusing the handshake is not enough: the connection opened before
// the deactivation would stay open and keep delivering, and keep sending, as a
// banned account. Disconnecting is what makes "deactivated" mean it for a live
// session rather than only for the next login.
//
// This is the one thing in this module that is not an emit, and it is here rather
// than in the deactivation service so that service never has to reach for the
// socket.io instance itself — which would mean importing it and reintroducing the
// emit/handle cycle this module exists to break.
export const disconnectUser = (userId) => {
  io?.in(userRoom(userId)).disconnectSockets(true);
};
