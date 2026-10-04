import { z } from 'zod';

// Self-service profile edits. Deliberately short, and the omissions are the point:
//
// - email is NOT editable. It is the login identifier and the column uq_users_nid /
//   uq_users_email guard; changing it would need a re-verification flow this app does
//   not have.
// - nid is NOT editable. It identifies the person rather than describing them, and it
//   anchors the deactivation audit trail (false_reports.flagged_by, users.deactivated_at).
//   An account that can rewrite its own NID makes that trail unfalsifiable. A
//   mistyped NID is corrected by an admin, not self-service.
// - profile_image is NOT editable here. users.profile_image holds a provider-agnostic
//   URL, but next.config.mjs only allows res.cloudinary.com in images.remotePatterns,
//   so an arbitrary URL would throw in next/image on every render. There is no avatar
//   upload endpoint to point it at; until there is, exposing the field would ship a
//   control that breaks the header.
//
// What is left is what a person actually fills in about themselves, and all three roles
// get the same three fields.
export const updateProfileSchema = z
  .object({
    // optional(), never required: this is a PATCH-shaped body where a caller may send
    // only `phone`. Making name required would reject that with a spurious "expected
    // string, received undefined" pointing at a field the caller never touched, and would
    // make clearing the phone impossible.
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name cannot exceed 100 characters')
      .optional(),
    // nullish, not nullable: in Zod v4 .nullable() still marks the key required, which
    // would reject a body that only carries `name`. null here means "clear my phone".
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\-\s()]{6,20}$/, 'Must be a valid phone number')
      .nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(6, 'New password must be at least 6 characters')
    .max(72, 'New password cannot exceed 72 characters'),
  // bcrypt truncates at 72 bytes, so a longer limit would be a lie: the extra characters
  // are silently ignored, which means `newPassword` and a 72-char prefix of it are the
  // same password. Matches createStaffSchema's cap.
});