import { z } from 'zod';

// One definition shared by every paginated collection, so page/limit bounds are
// identical across modules and a caller cannot ask for an unbounded scan.
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// LIMIT/OFFSET cannot be bound as placeholders by MySQL, so they are interpolated.
// These are never user-supplied: `toPage` has already coerced both to integers
// inside a checked range, and paginationSchema is what does the checking.
export const limitClause = ({ limit, offset }) => `LIMIT ${limit} OFFSET ${offset}`;

export const toPage = (query) => {
  const { page, limit } = paginationSchema.parse(query ?? {});
  return { page, limit, offset: (page - 1) * limit };
};

export const buildMeta = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});
