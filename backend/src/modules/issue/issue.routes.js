import { Router } from 'express';
import * as issueController from './issue.controller.js';
import {
  createIssueSchema,
  updateIssueSchema,
  listIssuesQuerySchema,
  myIssuesQuerySchema,
  duplicateQuerySchema,
  flagIssueSchema,
} from './issue.validation.js';
import validate, { validateQuery } from '../../middleware/validate.js';
import { protect, optionalAuth, requireRole } from '../../middleware/auth.js';

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
// Public. An issue page is the whole point of a public reporting app, and it has to be
// readable by someone with no account or there is nothing for them to vote on or
// comment on. optionalAuth attaches req.user when a token is present — which is what
// keeps the reporter's own "is this mine" checks and the staff management panels
// working — and never refuses the request.
//
// The other GETs stay behind `protect`: the aggregate stats and the resolved summary
// are dashboard data, not something a public page needs.
router.get('/:id', optionalAuth, issueController.getIssue);

// Public for the same reason as '/:id': a status timeline is the substance of a public
// report, and it discloses nothing the issue row does not already — the acting officer
// is identified by name, exactly like `assignee_name` on the detail payload.
router.get('/:id/status-history', optionalAuth, issueController.getStatusHistory);

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

// Flagging a report false is a judgement made on the ground by the officer it is
// assigned to, so it is staff-only — an admin's role is to review the queue this
// feeds, not to add to it. requireRole already supplies `protect`, so this does not
// repeat it.
router.post(
  '/:id/invalid',
  ...requireRole('staff'),
  validate(flagIssueSchema),
  issueController.flagIssueAsInvalid,
);

export default router;
