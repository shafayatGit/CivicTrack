import { Router } from 'express';
import * as messageController from './message.controller.js';
import { withIdentity } from './message.controller.js';
import {
  sendMessageSchema,
  threadSchema,
  listThreadsQuerySchema,
} from './message.validation.js';
import validate, { validateQuery } from '../../middleware/validate.js';
import { protect, requireRole } from '../../middleware/auth.js';

const router = Router();

// messages are a staff <-> admin channel (ERD 1.12), so a citizen has no business
// in this module at all.
const staffOrAdmin = requireRole('staff', 'admin');

router.use(protect, staffOrAdmin, withIdentity);

router.get('/admins', messageController.listAdmins);

router.get(
  '/threads',
  validateQuery(listThreadsQuerySchema),
  messageController.listThreads,
);

router.get('/unread-count', messageController.getUnreadCount);

router.post(
  '/thread',
  validate(threadSchema),
  messageController.markThreadRead,
);

router.post(
  '/',
  validate(sendMessageSchema),
  messageController.sendMessage,
);

// History is read with a POST because a thread is identified by a body triplet
// (staffId, adminId, issueId) and Express 5 cannot bind a null-safe `issue_id <=> ?`
// from a query string. Pagination still comes from the query string.
router.post(
  '/thread/messages',
  validate(threadSchema),
  messageController.getThreadMessages,
);

export default router;
