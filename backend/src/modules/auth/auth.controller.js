import asyncHandler from '../../utils/asyncHandler.js';
import * as authService from './auth.service.js';

// Exported so a profile edit can re-issue the same cookie with the same options rather
// than repeating this object; two copies of a cookie policy is one drift away from
// cookies that are set with a different lifetime in two places.
export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export const register = asyncHandler(async (req, res) => {
  const result = await authService.createUser(req.body);
  res.cookie('token', result.token, COOKIE_OPTIONS);
  res.status(201).json({ success: true, data: result });
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.loginUser(req.body);
  res.cookie('token', result.token, COOKIE_OPTIONS);
  res.json({ success: true, data: result });
});