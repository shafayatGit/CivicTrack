import asyncHandler from '../../utils/asyncHandler.js';
import * as staffService from './staff.service.js';

export const createStaff = asyncHandler(async (req, res) => {
  const staff = await staffService.createStaff(req.body);
  res.status(201).json({ success: true, data: staff });
});

export const listStaff = asyncHandler(async (req, res) => {
  const result = await staffService.listStaff(req.validatedQuery);
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

export const getStaff = asyncHandler(async (req, res) => {
  const staff = await staffService.getStaff(req.params.id);
  res.json({ success: true, data: staff });
});

export const updateStaff = asyncHandler(async (req, res) => {
  const staff = await staffService.updateStaff(req.params.id, req.body);
  res.json({ success: true, data: staff });
});

export const deleteStaff = asyncHandler(async (req, res) => {
  await staffService.deleteStaff(req.params.id);
  res.json({ success: true, message: 'Staff member deleted' });
});

export const listAvailableStaff = asyncHandler(async (req, res) => {
  const staff = await staffService.listAvailableStaff(req.validatedQuery.departmentId);
  res.json({ success: true, data: staff });
});
