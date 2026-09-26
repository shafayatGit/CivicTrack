import { Router } from 'express';
import * as staffController from './staff.controller.js';
import {
  createStaffSchema,
  updateStaffSchema,
  listStaffQuerySchema,
  listAvailableStaffQuerySchema,
} from './staff.validation.js';
import validate, { validateQuery } from '../../middleware/validate.js';
import { protect, adminOnly } from '../../middleware/auth.js';

const router = Router();

// /available must be declared before /:id, otherwise "available" is swallowed by the
// parameter route and Express tries to parse it as a UUID.
router.get(
  '/available',
  protect,
  validateQuery(listAvailableStaffQuerySchema),
  staffController.listAvailableStaff,
);

router.get('/', protect, validateQuery(listStaffQuerySchema), staffController.listStaff);
router.get('/:id', protect, staffController.getStaff);

router.post(
  '/',
  protect,
  adminOnly,
  validate(createStaffSchema),
  staffController.createStaff,
);

router.put(
  '/:id',
  protect,
  adminOnly,
  validate(updateStaffSchema),
  staffController.updateStaff,
);

router.delete('/:id', protect, adminOnly, staffController.deleteStaff);

export default router;
