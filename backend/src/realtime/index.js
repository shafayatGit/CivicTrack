import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';
import { setIo } from './hub.js';
import * as messageService from '../modules/message/message.service.js';
import { registerChatHandlers } from '../modules/message/message.socket.js';

const parseCookies = (header = '') =>
  Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value !== undefined)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join('='))]),
  );

// The browser WebSocket API cannot set an Authorization header, so the token has to
// arrive either in the handshake auth payload or as the cookie the auth routes
// already set. Both are accepted for parity with the REST middleware.
const extractToken = (socket) =>
  socket.handshake.auth?.token ||
  socket.handshake.headers?.authorization?.split(' ')[1] ||
  parseCookies(socket.handshake.headers?.cookie).token;

// Reusing the message service's identity resolution here is deliberate: a socket
// must be refused exactly when the equivalent REST call would be, and a staff
// account with no staff row (migration 007's app-layer invariant) has no threads.
//
// The role check is not optional. Verifying a valid citizen JWT is not enough —
// messages are a staff<->admin channel (ERD 1.12), so a citizen that connects and is
// merely idle is a hole waiting for a handler that forgets to re-check.
const ALLOWED_ROLES = new Set(['staff', 'admin']);

const authenticate = async (socket, next) => {
  const token = extractToken(socket);

  if (!token) {
    return next(new Error('No token provided'));
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);

    if (!ALLOWED_ROLES.has(user.role)) {
      return next(new Error('Messages are available to staff and admins only'));
    }

    const identity = await messageService.getIdentity(user);

    socket.data.identity = identity;
    return next();
  } catch (error) {
    if (error instanceof ApiError) {
      return next(new Error(error.message));
    }
    return next(new Error('Invalid or expired token'));
  }
};

export const initRealtime = (httpServer) => {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') ?? true,
      credentials: true,
    },
    // Drops a socket that has stopped responding instead of holding it open forever.
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  io.use(authenticate);

  io.on('connection', (socket) => {
    registerChatHandlers(socket);
  });

  setIo(io);

  return io;
};
