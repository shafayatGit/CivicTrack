// Shared by the performance report: the Zod schema that parses the window out of the
// query string, and the two constants the service needs to enforce the same rules.
//
// This lives in utils/ rather than in department.validation.js because both the
// validation layer and the service layer need it, and no service in this codebase
// imports its own module's validation file — the dependency only ever points inward at
// utils, which is the same direction pagination.js already sets.
import { z } from 'zod';
import { paginationSchema } from './pagination.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD form');

export const MAX_WINDOW_DAYS = 366;

export const performanceQuerySchema = paginationSchema.extend({
  departmentId: z.uuid('Invalid identifier').optional(),
  // Inclusive on both ends. Both bounds are optional and the service fills in the
  // current calendar month for whichever is missing.
  periodStart: isoDate.optional(),
  periodEnd: isoDate.optional(),
});

export const performanceDepartmentQuerySchema = paginationSchema.extend({
  // Only a cap, no page: the trend endpoint returns the most recent N windows for one
  // department and there is nothing to page through. Numbered rather than declared
  // inline in the route so limitClause's interpolation is fed by an already-coerced
  // integer, same contract as paginationSchema.
  limit: z.coerce.number().int().min(1).max(MAX_WINDOW_DAYS).default(12),
});

export { isoDate };