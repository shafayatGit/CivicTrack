import asyncHandler from '../../utils/asyncHandler.js';
import * as departmentService from './department.service.js';

export const createDepartment = asyncHandler(async (req, res) => {
  const department = await departmentService.createDepartment(req.body);
  res.status(201).json({ success: true, data: department });
});

export const listDepartments = asyncHandler(async (req, res) => {
  const result = await departmentService.listDepartments(req.query);
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

export const getDepartment = asyncHandler(async (req, res) => {
  const department = await departmentService.getDepartment(req.params.id);
  res.json({ success: true, data: department });
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const department = await departmentService.updateDepartment(req.params.id, req.body);
  res.json({ success: true, data: department });
});

export const deleteDepartment = asyncHandler(async (req, res) => {
  await departmentService.deleteDepartment(req.params.id);
  res.json({ success: true, message: 'Department deleted' });
});
