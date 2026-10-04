import { Router } from 'express';
import * as departmentController from './department.controller.js';
import {
  createDepartmentSchema,
  updateDepartmentSchema,
  snapshotSchema,
  performanceQuerySchema,
  performanceDepartmentQuerySchema,
} from './department.validation.js';
import validate, { validateQuery } from '../../middleware/validate.js';
import { protect, adminOnly } from '../../middleware/auth.js';

const router = Router();

// Reads are open to any signed-in user because the issue report form needs the
// department list; writes are admin-only, matching the categories module.

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------
// Declared BEFORE '/:id' on purpose. This is the same trap as issue.routes.js and
// staff.routes.js: '/performance' would be captured by the parameter route and parsed as
// a UUID, so every performance request would 404 with 'Department not found' — an error
// that looks like missing data rather than a routing mistake.
//
// Order within the group: the two-segment '/:id/performance' needs no static segment of
// its own, but '/performance' above it does.
router.get(
  '/performance',
  protect,
  validateQuery(performanceQuerySchema),
  departmentController.listPerformance,
);

router.get(
  '/:id/performance',
  protect,
  validateQuery(performanceDepartmentQuerySchema),
  departmentController.getDepartmentPerformance,
);

router.post(
  '/performance/snapshot',
  protect,
  adminOnly,
  validate(snapshotSchema),
  departmentController.generatePerformance,
);

// ---------------------------------------------------------------------------

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