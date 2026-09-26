import { z } from 'zod';
import { paginationSchema } from '../../utils/pagination.js';
import { nidSchema } from '../../utils/nid.js';

const uuid = z.uuid('Invalid identifier');

export const createStaffSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.email('Must be a valid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters'),
  departmentId: uuid,
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{6,20}$/, 'Must be a valid phone number')
    .nullish(),
  // Required, not optional. Migration 018 made users.nid NOT NULL, and createStaff
  // inserts into users, so leaving this .nullish() only moved the failure from the
  // request body to the INSERT, where MySQL raised NOT NULL and the client saw an
  // opaque 500 instead of a field error.
  nid: nidSchema(),
});

export const updateStaffSchema = z
  .object({
    departmentId: uuid.optional(),
    preferences: z.record(z.string(), z.unknown()).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listStaffQuerySchema = paginationSchema.extend({
  departmentId: uuid.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export const listAvailableStaffQuerySchema = z.object({
  departmentId: uuid,
});
