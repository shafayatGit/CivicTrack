import * as messageService from './message.service.js';
import { threadRoom, userRoom } from '../../realtime/hub.js';
import { sendMessageSchema, threadSchema } from './message.validation.js';

// Every handler is wrapped so a rejection becomes an ack instead of an unhandled
// rejection. The client is told what went wrong either way — a socket that silently
// drops an event is far harder to debug than one that answers with an error.
const handle = (fn) => async (payload, ack) => {
  try {
    const data = await fn(payload ?? {});
    ack?.({ ok: true, data });
  } catch (error) {
    ack?.({
      ok: false,
      error: {
        message: error.message,
        statusCode: error.statusCode ?? 500,
        details: error.details ?? null,
      },
    });
  }
};

// Socket payloads go through the same Zod schemas as the REST bodies. Without this
// the socket path is an unvalidated hole straight into the service layer: an empty
// message_text is NOT NULL in the schema but '' satisfies it, so a socket client
// could persist blank messages that the REST route correctly rejects.
const validated = (schema) => (payload) => schema.parse(payload ?? {});

export const registerChatHandlers = (socket) => {
  const identity = socket.data.identity;

  // Automatic: one socket per account per device, all reachable by userRoom().
  socket.join(userRoom(identity.userId));

  socket.emit('connection:ready', {
    userId: identity.userId,
    role: identity.role,
    staffId: identity.staffId,
  });

  // --- joining a thread -----------------------------------------------------
  // Re-resolving through the service is what stops a socket joining a thread its
  // owner is not a participant in. That matters: the room is where message:new is
  // delivered, so an unchecked join would be a read-side authorisation hole.
  socket.on(
    'thread:join',
    handle(async (payload) => {
      const thread = await messageService.resolveThread(
        identity,
        validated(threadSchema)(payload),
      );
      const room = threadRoom(thread.staffId, thread.adminId, thread.issueId);

      socket.join(room);

      return { room, thread };
    }),
  );

  socket.on(
    'thread:leave',
    handle(async (payload) => {
      const thread = await messageService.resolveThread(
        identity,
        validated(threadSchema)(payload),
      );
      const room = threadRoom(thread.staffId, thread.adminId, thread.issueId);

      socket.leave(room);

      return { room };
    }),
  );

  // --- sending --------------------------------------------------------------
  // sendMessage already broadcasts to the thread room and both user rooms, so this
  // handler only validates and delegates.
  socket.on(
    'message:send',
    handle(async (payload) => {
      const { messageText, ...threadInput } = validated(sendMessageSchema)(payload);
      const thread = await messageService.resolveThread(identity, threadInput);

      return messageService.sendMessage(identity, thread, messageText);
    }),
  );

  socket.on(
    'thread:read',
    handle(async (payload) => {
      const thread = await messageService.resolveThread(
        identity,
        validated(threadSchema)(payload),
      );

      return messageService.markThreadRead(identity, thread);
    }),
  );

  socket.on(
    'unread:count',
    handle(async () => messageService.getUnreadCount(identity)),
  );
};
