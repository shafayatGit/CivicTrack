import asyncHandler from '../../utils/asyncHandler.js';
import * as issuePhotoService from './issuePhoto.service.js';
import { photoIssueIdSchema } from './issuePhoto.validation.js';

export const addPhotoByUrl = asyncHandler(async (req, res) => {
  const photo = await issuePhotoService.addPhotoByUrl(req.body);
  res.status(201).json({ success: true, data: photo });
});

export const uploadPhoto = asyncHandler(async (req, res) => {
  // req.file is guaranteed by the issuePhotoUpload middleware; issueId is the
  // multipart text field that came with it.
  const { issueId } = photoIssueIdSchema.parse({ issueId: req.body.issueId });

  const photo = await issuePhotoService.uploadPhoto({ issueId, file: req.file });
  res.status(201).json({ success: true, data: photo });
});

export const listPhotosByIssue = asyncHandler(async (req, res) => {
  const photos = await issuePhotoService.listPhotosByIssue(req.params.issueId);
  res.json({ success: true, data: photos });
});

export const getPhoto = asyncHandler(async (req, res) => {
  const photo = await issuePhotoService.getPhoto(req.params.id);
  res.json({ success: true, data: photo });
});

export const deletePhoto = asyncHandler(async (req, res) => {
  await issuePhotoService.deletePhoto(req.params.id);
  res.json({ success: true, message: 'Photo deleted' });
});
