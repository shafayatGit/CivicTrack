import { z } from 'zod';
import { paginationSchema } from '../../utils/pagination.js';

// ---------------------------------------------------------------------------
// Public thread
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

// `includeHidden` is a Zod boolean from the query string, which arrives as the strings
// "true"/"false". z.coerce.boolean would turn the string "false" into true, which
// would quietly expose every hidden comment to the public — so the accepted spellings
// are listed explicitly instead.
const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1')
  .optional();

export const listCommentsQuerySchema = paginationSchema
  .extend({
    // Only honoured for an admin, and enforced in the controller by passing
    // `req.user?.role === 'admin' && includeHidden` rather than the raw param.
    includeHidden: booleanish,
  })
  .strict();

export const createCommentSchema = z.object({
  commentText: z
    .string({ error: 'Write something first' })
    .trim()
    .min(1, 'Write something first')
    // Bounded rather than relying on the TEXT column: an unbounded public text field is
    // a free storage slot, and a 2000-char comment is already longer than anyone needs
    // in a thread reply.
    .max(2000, 'Keep it under 2000 characters'),
  // Only used when the caller is anonymous; ignored for a signed-in user. Optional so an
  // anonymous visitor can post without being forced to invent a name.
  authorName: z
    .string()
    .trim()
    .min(1)
    .max(80, 'Name is too long')
    .optional(),
});

export const hideCommentSchema = z.object({
  // Optional: a takedown without a stated reason is still allowed, but the thread
  // placeholder reads much better with one.
  reason: z.string().trim().max(255, 'Reason is too long').nullish(),
});
