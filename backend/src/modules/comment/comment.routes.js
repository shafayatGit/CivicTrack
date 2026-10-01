import { Router } from 'express';
import * as commentController from './comment.controller.js';
import validate, { validateQuery } from '../../middleware/validate.js';
import {
  createCommentSchema,
  hideCommentSchema,
  listCommentsQuerySchema,
} from './comment.validation.js';
import { optionalAuth, protect, adminOnly } from '../../middleware/auth.js';
import { rateLimit } from '../../utils/rateLimit.js';

// ---------------------------------------------------------------------------
// Public thread — mounted at /api/issues/:id/comments
// ---------------------------------------------------------------------------
// Readable and writable without an account. optionalAuth attributes the comment when a
// token is present and is never the reason a request is refused; the rate limiter is
// the only thing between this endpoint and being an open spam relay.
// mergeParams is REQUIRED on both routers: the issue id comes from the MOUNT path, and
// an Express 5 router does not inherit params from the path it is mounted at unless it
// opts in. Without it req.params is {} and every request 404s with "Issue not found".
// See vote.routes.js for the same trap.
const publicRouter = Router({ mergeParams: true });

publicRouter.use(optionalAuth);

publicRouter.get('/', validateQuery(listCommentsQuerySchema), commentController.listComments);

publicRouter.post(
  '/',
  // Tighter than the vote budget: a vote is one cheap row, this writes text that anyone
  // can read. 5/minute is roughly fast typing and slow enough to stop a script.
  rateLimit({ key: 'comment', windowMs: 60_000, max: 5 }),
  validate(createCommentSchema),
  commentController.createComment,
);

// ---------------------------------------------------------------------------
// Moderation — mounted at /api/moderation/comments
// ---------------------------------------------------------------------------
// A separate router and a separate URL, so `protect`/`adminOnly` can never be applied
// to the public paths by accident and an admin never reads a hidden comment through the
// public list.
const moderationRouter = Router();

moderationRouter.use(protect, adminOnly);

moderationRouter.post(
  '/:id/hide',
  validate(hideCommentSchema),
  commentController.hideComment,
);

moderationRouter.post('/:id/restore', commentController.restoreComment);

moderationRouter.delete('/:id', commentController.deleteComment);

export { publicRouter, moderationRouter };
