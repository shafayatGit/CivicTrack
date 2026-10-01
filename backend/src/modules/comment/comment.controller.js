import asyncHandler from '../../utils/asyncHandler.js';
import { assertCanParticipate } from '../../utils/participation.js';
import * as commentService from './comment.service.js';

export const listComments = asyncHandler(async (req, res) => {
  const { includeHidden, ...paging } = req.validatedQuery;

  // Admin-only, decided here rather than trusted from the query string. A public caller
  // asking for includeHidden=true gets the default public view.
  const isAdmin = req.user?.role === 'admin';

  const result = await commentService.listComments({
    issueId: req.params.id,
    includeHidden: isAdmin && includeHidden,
    ...paging,
  });

  res.json({
    success: true,
    data: result.items.map(commentService.presentComment),
    pagination: result.pagination,
  });
});

export const createComment = asyncHandler(async (req, res) => {
  // Same rule as voting, and for the same reason: the thread is a measure of resident
  // sentiment, and an official comment is not one. Moderation of other people's comments
  // is unaffected — only adding their own is refused.
  assertCanParticipate(req.user, 'Commenting');

  const comment = await commentService.createComment(
    req.params.id,
    { userId: req.user?.id ?? null },
    req.body,
  );

  res.status(201).json({
    success: true,
    data: commentService.presentComment(comment),
  });
});

export const hideComment = asyncHandler(async (req, res) => {
  const result = await commentService.hideComment(
    req.params.id,
    req.user,
    req.body.reason,
  );

  res.json({ success: true, data: result });
});

export const restoreComment = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await commentService.restoreComment(req.params.id),
  });
});

export const deleteComment = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await commentService.deleteComment(req.params.id),
  });
});
