import { Router } from 'express';
import * as userController from './user.controller.js';
import { protect, adminOnly } from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import { updateProfileSchema, changePasswordSchema } from './user.validation.js';

const router = Router();

// ---------------------------------------------------------------------------
// Self-service — any signed-in account
// ---------------------------------------------------------------------------
// The actor is always req.user, never a body or path field, so there is no id to
// spoof: PUT /api/users/profile cannot become "update someone else's profile" by
// adding a userId. Open to all three roles deliberately — a resident, a field officer
// and an administrator all have a name, a phone number and a password, and gating this
// by role would mean maintaining three copies of the same form.
//
// Declared before the /:id routes because '/profile' and '/change-password' would
// otherwise be swallowed by the parameter route and parsed as a UUID.
router.get('/profile', protect, userController.getMyProfile);

router.put('/profile', protect, validate(updateProfileSchema), userController.updateProfile);

router.post(
  '/change-password',
  protect,
  validate(changePasswordSchema),
  userController.changePassword,
);

// ---------------------------------------------------------------------------
// Admin-only — acting on someone else's account
// ---------------------------------------------------------------------------
// The moderation surface: reading a citizen's current account state and undoing a
// deactivation. Deliberately not a general user-management API, and the route names say
// which of the two is which. Guards are per-route rather than router.use because the
// self-service routes above must reach a non-admin.
router.get('/:id', protect, adminOnly, userController.getUser);
router.post('/:id/reactivate', protect, adminOnly, userController.reactivate);

export default router;
