import { z } from 'zod';
import { isoDate } from '../../utils/performance.js';

// The window shapes live in utils/performance.js, next to MAX_WINDOW_DAYS, because the
// service enforces the same bounds and no service here imports its own validation file.
export {
  performanceQuerySchema,
  performanceDepartmentQuerySchema,
  MAX_WINDOW_DAYS,
} from '../../utils/performance.js';

// The snapshot trigger. No pagination: this writes, and a paginated write would be a
// strange thing to expose.
//
// Both bounds are .nullish() rather than required, because the controller resolves a
// missing bound to the current calendar month. An empty body therefore means "this
// month", which is the case an admin will hit most often. Required fields would have made
// resolvePeriod's defaulting unreachable behind a 400, and the cross-field refine would
// have nothing to compare when a bound is absent — hence optional first, refine after
// the service has filled the pair in (assertWindowIsSane owns the ordering check).
//
// Deliberately has no `month` shortcut. "Generate for a month" is the common case, but
// a shortcut invites callers to believe a month is the only unit this report supports —
// and a quarter or a custom window is a legitimate thing to ask it for.
export const snapshotSchema = z.object({
  periodStart: isoDate.nullish(),
  periodEnd: isoDate.nullish(),
});

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  contactEmail: z.email('Must be a valid email').nullish(),
  // .nullish() rather than .optional(): null is how an admin opts a department OUT of
  // the overdue metric, which is a different statement from "leave whatever it was".
  //
  // min(1) mirrors chk_departments_resolution_target in migration 024. The database
  // rejects 0 and negatives, but it reports the violation under MariaDB's misleading
  // ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE code, which the error handler cannot map —
  // so catching it here is a 400 with a message on the field instead of an opaque 500.
  resolutionTargetHours: z.coerce
    .number()
    .int('Must be a whole number of hours')
    .min(1, 'Target must be at least 1 hour')
    .max(8760, 'Target cannot exceed 8760 hours (one year)')
    .nullish(),
});

// A PUT, not a PATCH: this is the department editor form, which always submits a name,
// so `name` staying required is correct rather than an oversight.
export const updateDepartmentSchema = createDepartmentSchema;