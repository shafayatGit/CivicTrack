import { Router } from 'express';
import * as falseReportController from './falseReport.controller.js';
import { listFalseReportsQuerySchema, deactivateCitizenSchema } from './falseReport.validation.js';
import validate, { validateQuery } from '../../middleware/validate.js';
import { protect, adminOnly } from '../../middleware/auth.js';

const router = Router();

// Admin-only, all of it. A false report is a judgement about a citizen, and the
// decisions available here (deactivate or dismiss) both act on a person's account,
// so the whole module is behind adminOnly rather than per-route.
router.use(protect, adminOnly);

router.get(
  '/',
  validateQuery(listFalseReportsQuerySchema),
  falseReportController.listFalseReports,
);

// Upholding the flag deactivates the citizen who filed the report.
router.post(
  '/:id/deactivate',
  validate(deactivateCitizenSchema),
  falseReportController.deactivateCitizen,
);

// Dismissing it hands the report back to the normal workflow and leaves the citizen
// alone.
router.post('/:id/dismiss', falseReportController.dismissFlag);

export default router;
