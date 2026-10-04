import asyncHandler from '../../utils/asyncHandler.js';
import { COOKIE_OPTIONS } from '../auth/auth.controller.js';
import { generateToken } from '../auth/auth.service.js';
import * as userService from './user.service.js';

export const getUser = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await userService.getUser(req.params.id) });
});

export const reactivate = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await userService.reactivate(req.params.id) });
});

// Same row as updateProfile returns, read once to seed the settings form. Separate from
// the admin GET /:id because that one is deliberately adminOnly.
export const getMyProfile = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await userService.getMyProfile(req.user.id),
  });
});

// The actor is req.user, taken from the verified token — never a body or path field — so
// there is no id in this request to point at somebody else's row.
export const updateProfile = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user.id, req.body);

  // `name` is a signed JWT claim and the frontend has no /api/auth/me to re-read it
  // from, so a renamed user would keep seeing the old name in the header until their
  // token expired. Re-minting is what makes the save visible; the client overwrites its
  // stored token from data.token. role and email cannot have changed (not writable
  // here), so carrying req.user's values forward is not trusting stale data.
  const token = generateToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });

  res.cookie('token', token, COOKIE_OPTIONS);
  res.json({ success: true, data: { ...user, token } });
});

// No token is re-issued, and that is a real consequence rather than an oversight: the
// password is not a claim, so the existing token stays valid for the rest of its life.
// Revoking it would need a token-version column checked by `protect` on every request,
// which is a schema change for a hardening step this app has not asked for. The
// practical effect is that a stolen token outlives a password change — changing the
// password is therefore not a way to lock out someone who already has a session.
export const changePassword = asyncHandler(async (req, res) => {
  const result = await userService.changePassword(req.user.id, req.body);
  res.json({ success: true, data: result });
});
