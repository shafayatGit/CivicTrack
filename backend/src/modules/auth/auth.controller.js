import asyncHandler from '../../utils/asyncHandler.js';
import * as authService from './auth.service.js';

export const register = asyncHandler(async (req, res) => {
  const user = await authService.createUser(req.body);
  res.status(201).json({ success: true, data: user });
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.loginUser(req.body);
  res.json({ success: true, data: result });
});