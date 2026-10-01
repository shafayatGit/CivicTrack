import { Router } from 'express';
import * as userController from './user.controller.js';
import { protect, adminOnly } from '../../middleware/auth.js';

const router = Router();

// Admin-only. This module exists for the moderation flow: reading a citizen's
// current account state and undoing a deactivation. It is deliberately not a general
// user-management API, and the route names say which of the two is which.
router.use(protect, adminOnly);

router.get('/:id', userController.getUser);
router.post('/:id/reactivate', userController.reactivate);

export default router;
