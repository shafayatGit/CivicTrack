import asyncHandler from '../../utils/asyncHandler.js';
import * as wardService from './ward.service.js';

export const createWard = asyncHandler(async (req, res) => {
  const ward = await wardService.createWard(req.body);
  res.status(201).json({ success: true, data: ward });
});

export const listWards = asyncHandler(async (req, res) => {
  const result = await wardService.listWards(req.query);
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

export const getWard = asyncHandler(async (req, res) => {
  const ward = await wardService.getWard(req.params.id);
  res.json({ success: true, data: ward });
});

export const updateWard = asyncHandler(async (req, res) => {
  const ward = await wardService.updateWard(req.params.id, req.body);
  res.json({ success: true, data: ward });
});

export const deleteWard = asyncHandler(async (req, res) => {
  await wardService.deleteWard(req.params.id);
  res.json({ success: true, message: 'Ward deleted' });
});
