import { z } from 'zod';
import { paginationSchema } from '../../utils/pagination.js';

const uuid = z.uuid('Invalid identifier');

export const threadSchema = z.object({
  staffId: uuid.optional(),
  adminId: uuid.optional(),
  issueId: uuid.nullish(),
});

export const sendMessageSchema = threadSchema.extend({
  messageText: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message cannot exceed 2000 characters'),
});

export const listThreadsQuerySchema = paginationSchema.extend({
  issueId: uuid.optional(),
});
