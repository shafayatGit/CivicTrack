import { z } from 'zod';

const uuid = z.uuid('Invalid identifier');

const name = z.string().trim().min(2, 'Name must be at least 2 characters');

// default_department_id is the auto-routing hook added in migration 006: when a
// citizen reports an issue against this category and names no department, the issue
// service falls back to this value. It is optional, and null actively unroutes the
// category rather than leaving it unchanged.
export const createCategorySchema = z.object({
  name,
  description: z.string().trim().min(1, 'Description is required').optional(),
  defaultDepartmentId: uuid.nullish(),
});

export const updateCategorySchema = z.object({
  name,
  description: z.string().trim().min(1, 'Description is required'),
  defaultDepartmentId: uuid.nullish(),
});
