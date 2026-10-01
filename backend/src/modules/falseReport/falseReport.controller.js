import asyncHandler from '../../utils/asyncHandler.js';
import * as falseReportService from './falseReport.service.js';

export const listFalseReports = asyncHandler(async (req, res) => {
  const result = await falseReportService.listFalseReports(req.validatedQuery);
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

export const deactivateCitizen = asyncHandler(async (req, res) => {
  const result = await falseReportService.deactivateCitizen(
    req.params.id,
    req.user,
    req.body,
  );
  res.json({ success: true, data: result });
});

export const dismissFlag = asyncHandler(async (req, res) => {
  const result = await falseReportService.dismissFlag(req.params.id, req.user);
  res.json({ success: true, data: result });
});
