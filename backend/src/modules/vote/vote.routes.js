import { Router } from 'express';
import * as voteController from './vote.controller.js';
import { optionalAuth } from '../../middleware/auth.js';
import { rateLimit } from '../../utils/rateLimit.js';

// Mounted at /api/issues/:id/vote, so the routes are on the collection rather than
// repeating the id in the path.
//
// mergeParams is REQUIRED here, not a stylistic choice: the id comes from the MOUNT
// path, and an Express 5 router does not inherit params from the path it is mounted at
// unless it opts in. Without it req.params is {} inside every handler, the service
// looks up an undefined id, and every request 404s with "Issue not found" — verified
// on express 5.2.1.
//
// Public by design: voting is the feature that is meant to work without an account.
// optionalAuth attributes the vote when a token happens to be present, but never
// refuses the request.
const router = Router({ mergeParams: true });

router.use(optionalAuth);

router.get('/', voteController.getVoteSummary);

router.post(
  '/',
  // Keyed separately from comments, so hammering one endpoint cannot spend the other
  // endpoint's allowance.
  rateLimit({ key: 'vote', windowMs: 60_000, max: 20 }),
  voteController.toggleVote,
);

export default router;
