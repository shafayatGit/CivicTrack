import asyncHandler from '../../utils/asyncHandler.js';
import * as categoryService from './category.service.js';

export const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body);
  res.status(201).json({ success: true, data: category });
});

export const listCategories = asyncHandler(async (req, res) => {
  const categories = await categoryService.listCategories();
  res.json({ success: true, data: categories });
});

export const getCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategory(req.params.id);
  res.json({ success: true, data: category });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(req.params.id, req.body);
  res.json({ success: true, data: category });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  await categoryService.deleteCategory(req.params.id);
  res.json({ success: true, message: 'Category deleted' });
});