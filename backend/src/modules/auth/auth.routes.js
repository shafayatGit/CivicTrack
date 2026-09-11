import { Router } from 'express';
import * as authController from './auth.controller.js';
import { registerSchema, loginSchema, validate } from './auth.validation.js';

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);

export default router;