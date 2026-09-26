import asyncHandler from '../../utils/asyncHandler.js';
import * as issueService from './issue.service.js';

export const createIssue = asyncHandler(async (req, res) => {
  const issue = await issueService.createIssue(req.user, req.body);
  res.status(201).json({ success: true, data: issue });
});

export const listIssues = asyncHandler(async (req, res) => {
  const result = await issueService.listIssues(req.validatedQuery);
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

export const getIssue = asyncHandler(async (req, res) => {
  const issue = await issueService.getIssue(req.params.id);
  res.json({ success: true, data: issue });
});

export const updateIssue = asyncHandler(async (req, res) => {
  const issue = await issueService.updateIssue(req.params.id, req.user, req.body);
  res.json({ success: true, data: issue });
});

export const getStatusHistory = asyncHandler(async (req, res) => {
  const history = await issueService.getStatusHistory(req.params.id);
  res.json({ success: true, data: history });
});

export const findDuplicates = asyncHandler(async (req, res) => {
  const duplicates = await issueService.findDuplicates(req.validatedQuery);
  res.json({ success: true, data: duplicates });
});

export const getResolvedSummary = asyncHandler(async (req, res) => {
  const result = await issueService.getResolvedSummary(req.query);
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

export const getStats = asyncHandler(async (req, res) => {
  const stats = await issueService.getStats();
  res.json({ success: true, data: stats });
});

// Both citizen endpoints read the user id from req.user, which protect populated from
// the verified token. Neither accepts a user id, so there is nothing for a caller to
// tamper with.
export const listMyIssues = asyncHandler(async (req, res) => {
  const result = await issueService.listMyIssues(req.user.id, req.validatedQuery);
  res.json({ success: true, data: result.items, pagination: result.pagination });
});

export const getMyStats = asyncHandler(async (req, res) => {
  const stats = await issueService.getMyStats(req.user.id);
  res.json({ success: true, data: stats });
});
