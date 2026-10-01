import asyncHandler from '../../utils/asyncHandler.js';
import { assertCanParticipate } from '../../utils/participation.js';
import * as voteService from './vote.service.js';

export const toggleVote = asyncHandler(async (req, res) => {
  // Before anything else, and in particular before resolveVoter: that call can mint and
  // set the ct_voter cookie, and a refused request should not leave a staff browser
  // holding an anonymous-vote identity it was never allowed to use.
  assertCanParticipate(req.user, 'Voting');

  await voteService.assertIssueExists(req.params.id);

  const voter = await voteService.resolveVoter(req, res);
  const state = await voteService.toggleVote(req.params.id, voter);

  // The count comes back with the state so the client never has to guess what the
  // number should be after a toggle.
  const summary = await voteService.summariseFor(req.params.id, voter);

  res.json({
    success: true,
    data: {
      ...state,
      voteCount: summary.voteCount,
      registeredVotes: summary.registeredVotes,
      hasVoted: summary.hasVoted,
    },
  });
});

export const getVoteSummary = asyncHandler(async (req, res) => {
  await voteService.assertIssueExists(req.params.id);

  const counts = await voteService.getCounts(req.params.id);

  // A read never mints a cookie, so a visitor arriving with no token gets the total
  // and a hasVoted of false rather than an identity. Their first click on the button
  // is what establishes one.
  const hasIdentity = Boolean(
    req.user?.id || req.cookies?.[voteService.VOTER_COOKIE],
  );

  const hasVoted = hasIdentity
    ? await voteService.hasVoted(
        req.params.id,
        await voteService.resolveVoter(req, res),
      )
    : false;

  res.json({ success: true, data: { ...counts, hasVoted } });
});
