import { Router } from 'express';
import * as issueController from './issue.controller.js';
import {
  createIssueSchema,
  updateIssueSchema,
  listIssuesQuerySchema,
  myIssuesQuerySchema,
  duplicateQuerySchema,
} from './issue.validation.js';
import validate, { validateQuery } from '../../middleware/validate.js';
import { protect } from '../../middleware/auth.js';

const router = Router();

// Static segments are declared before '/:id' so they are not captured as an id.
// Order matters here: '/duplicates/check' would otherwise be read as id = 'duplicates'.
router.get('/stats', protect, issueController.getStats);

router.get(
  '/reports/resolved-summary',
  protect,
  issueController.getResolvedSummary,
);

router.get(
  '/duplicates',
  protect,
  validateQuery(duplicateQuerySchema),
  issueController.findDuplicates,
);

// Declared before '/:id' on purpose: an Express 5 '/:id' route would otherwise
// swallow these literal paths and try to look up an issue called "mine".
router.get('/mine', protect, validateQuery(myIssuesQuerySchema), issueController.listMyIssues);
router.get('/my-stats', protect, issueController.getMyStats);

router.get('/', protect, validateQuery(listIssuesQuerySchema), issueController.listIssues);
router.get('/:id', protect, issueController.getIssue);

router.get('/:id/status-history', protect, issueController.getStatusHistory);

// Any signed-in user can report an issue; the reporter is taken from the token, not
// the body, so a citizen cannot file in someone else's name. No role guard here on
// purpose — the allowed set here is simply "everyone who is signed in".
router.post(
  '/',
  protect,
  validate(createIssueSchema),
  issueController.createIssue,
);

router.put(
  '/:id',
  protect,
  validate(updateIssueSchema),
  issueController.updateIssue,
);

export default router;
