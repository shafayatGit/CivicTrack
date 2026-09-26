import { z } from 'zod';

const uuid = z.uuid('Invalid identifier');

export const photoByUrlSchema = z.object({
  issueId: uuid,
  photoUrl: z.url('Must be a valid URL').max(500),
});

// issueId arrives as a multipart text field alongside the file, so it is a string
// here and the UUID check happens in the controller.
export const photoIssueIdSchema = z.object({
  issueId: uuid,
});
