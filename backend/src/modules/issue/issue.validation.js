import { z } from 'zod';
import { paginationSchema } from '../../utils/pagination.js';
import { ISSUE_STATUSES } from './issue.service.js';

const uuid = z.uuid('Invalid identifier');

// Dhaka sits near 23.8N / 90.4E, but the bounds are the whole globe rather than a
// city: rejecting a report because it came from outside the expected area would lose
// real civic issues. The tighter check that matters is "not (0,0)", which is what an
// un-geolocated form submission produces.
const latitude = z.coerce
  .number()
  .min(-90, 'Latitude must be between -90 and 90')
  .max(90, 'Latitude must be between -90 and 90');

const longitude = z.coerce
  .number()
  .min(-180, 'Longitude must be between -180 and 180')
  .max(180, 'Longitude must be between -180 and 180');

const coordinates = { latitude, longitude };

export const createIssueSchema = z.object({
  categoryId: uuid,
  wardId: uuid,
  // Optional: falls back to categories.default_department_id.
  departmentId: uuid.nullish(),
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(150),
  description: z.string().trim().min(10, 'Description must be at least 10 characters'),
  landmark: z.string().trim().max(150).nullish(),
  ...coordinates,
});

export const updateIssueSchema = z
  .object({
    status: z.enum(ISSUE_STATUSES).optional(),
    // nullish, not nullable: `.nullable()` still makes the KEY required in Zod v4,
    // so a status-only update would be rejected for a missing assignedStaffId.
    // nullish means "absent means do not touch this column".
    assignedStaffId: uuid.nullish(),
    landmark: z.string().trim().max(150).nullish(),
    citizenConfirmed: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listIssuesQuerySchema = paginationSchema.extend({
  status: z.enum(ISSUE_STATUSES).optional(),
  categoryId: uuid.optional(),
  wardId: uuid.optional(),
  departmentId: uuid.optional(),
  assignedStaffId: uuid.optional(),
  userId: uuid.optional(),
  unassigned: z.enum(['true', 'false']).optional(),
  search: z.string().trim().min(1).max(150).optional(),
});

// The citizen dashboard's own list. Deliberately narrower than listIssuesQuerySchema:
// it has no userId (that comes from the token), and no assignedStaffId or
// departmentId, because "my reports" is not a question about who is handling them.
export const myIssuesQuerySchema = paginationSchema.extend({
  status: z.enum(ISSUE_STATUSES).optional(),
  categoryId: uuid.optional(),
  wardId: uuid.optional(),
  search: z.string().trim().min(1).max(150).optional(),
});

export const duplicateQuerySchema = z.object({
  wardId: uuid,
  categoryId: uuid,
  ...coordinates,
  radiusKm: z.coerce.number().min(0.1).max(50).default(1),
});

// The officer's own explanation for calling a report false. It is the only thing an
// admin has to go on besides the issue itself, and it is what a wrongly-deactivated
// citizen would be shown, so it is required and bounded rather than optional free text.
export const flagIssueSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Explain in at least 10 characters why this is not a real report')
    .max(255),
});
