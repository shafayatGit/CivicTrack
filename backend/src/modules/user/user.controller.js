import asyncHandler from '../../utils/asyncHandler.js';
import * as userService from './user.service.js';

export const getUser = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await userService.getUser(req.params.id) });
});

export const reactivate = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await userService.reactivate(req.params.id) });
});
