import { z } from 'zod';
import { paginationSchema } from '../../utils/pagination.js';

// The queue defaults to 'pending' because that is the question an admin opens the
// page to answer: which flagged reports still need a decision. 'upheld' and
// 'dismissed' are the history, reachable by switching the filter.
export const listFalseReportsQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'upheld', 'dismissed']).default('pending'),
  // Spans the issue title and the submitting citizen, because "which reports did
  // this person file" is the other thing an admin needs from this screen.
  search: z.string().trim().min(1).max(150).optional(),
});

// The admin's note is stored on the flag and is the only thing a wrongly-deactivated
// citizen is ever shown on a login attempt, so it is optional but bounded — there is
// no default wording, because a generic "account deactivated" tells the person
// nothing about whether the decision was about them at all.
export const deactivateCitizenSchema = z.object({
  note: z.string().trim().min(3).max(255).nullish(),
});
