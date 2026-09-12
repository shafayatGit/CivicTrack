import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(1, 'Description is required').optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().min(1, 'Description is required'),
});