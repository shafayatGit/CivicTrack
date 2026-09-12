import { Router } from 'express';
import * as categoryController from './category.controller.js';
import {
  createCategorySchema,
  updateCategorySchema,
} from './category.validation.js';
import validate from '../../middleware/validate.js';
import { protect, adminOnly } from '../../middleware/auth.js';

const router = Router();

router.post(
  '/',
  protect,
  adminOnly,
  validate(createCategorySchema),
  categoryController.createCategory,
);
router.get('/', protect, categoryController.listCategories);
router.get('/:id', protect, categoryController.getCategory);
router.put(
  '/:id',
  protect,
  adminOnly,
  validate(updateCategorySchema),
  categoryController.updateCategory,
);
router.delete('/:id', protect, adminOnly, categoryController.deleteCategory);

export default router;