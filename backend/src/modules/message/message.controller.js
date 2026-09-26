import asyncHandler from '../../utils/asyncHandler.js';
import * as messageService from './message.service.js';
import { toPage } from '../../utils/pagination.js';

// The identity is resolved once per request and passed down, because every service
// call needs it and re-deriving the staff row from the JWT each time would be a
// wasted indexed lookup per handler step.
const withIdentity = asyncHandler(async (req, res, next) => {
  req.identity = await messageService.getIdentity(req.user);
  next();
});

export const listAdmins = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await messageService.listAdmins() });
});

export const listThreads = asyncHandler(async (req, res) => {
  const query = req.validatedQuery;
  const page = toPage(query);

  const result = await messageService.listThreads(req.identity, {
    ...page,
    issueId: query.issueId,
  });

  res.json({ success: true, data: result.items, pagination: result.pagination });
});

export const getThreadMessages = asyncHandler(async (req, res) => {
  const thread = await messageService.resolveThread(req.identity, req.body);
  const result = await messageService.getThreadMessages(req.identity, thread, req.query);

  res.json({ success: true, data: result.items, pagination: result.pagination });
});

export const sendMessage = asyncHandler(async (req, res) => {
  const { messageText, ...threadInput } = req.body;
  const thread = await messageService.resolveThread(req.identity, threadInput);
  const message = await messageService.sendMessage(req.identity, thread, messageText);

  res.status(201).json({ success: true, data: message });
});

export const markThreadRead = asyncHandler(async (req, res) => {
  const thread = await messageService.resolveThread(req.identity, req.body);
  const result = await messageService.markThreadRead(req.identity, thread);

  res.json({ success: true, data: result });
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await messageService.getUnreadCount(req.identity) });
});

export { withIdentity };
