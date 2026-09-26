import { Router } from 'express';
import * as departmentController from './department.controller.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
} from './department.validation.js';
import validate from '../../middleware/validate.js';
import { protect, adminOnly } from '../../middleware/auth.js';

const router = Router();

// Reads are open to any signed-in user because the issue report form needs the
// department list; writes are admin-only, matching the categories module.
router.get('/', protect, departmentController.listDepartments);
router.get('/:id', protect, departmentController.getDepartment);

router.post(
  '/',
  protect,
  adminOnly,
  validate(createDepartmentSchema),
  departmentController.createDepartment,
);

router.put(
  '/:id',
  protect,
  adminOnly,
  validate(updateDepartmentSchema),
  departmentController.updateDepartment,
);

router.delete('/:id', protect, adminOnly, departmentController.deleteDepartment);

export default router;
