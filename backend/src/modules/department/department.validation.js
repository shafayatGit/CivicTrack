import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  contactEmail: z.email('Must be a valid email').nullish(),
});

export const updateDepartmentSchema = createDepartmentSchema;
