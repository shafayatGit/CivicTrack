import { createHash, randomBytes, randomUUID } from 'crypto';
import db from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';

// Votes are open to anyone, signed in or not, so a vote needs an identity that works
// for both. This is that decision, in one place, because the read path and the write
// path must never disagree about who the caller is.
//
// Signed in  -> identity is user_id. Stable across devices, survives cookie clearing.
// Not signed in -> identity is voter_token, a random 64-char value from the cookie.
//
// The important caveat, which the UI copy also states: the token binds a vote to a
// BROWSER, not to a person. Clearing cookies, switching browser, or switching network
// all produce another vote. A public vote count with no account system cannot honestly
// claim more than that, and nothing in this file should be described as preventing
// duplicate public votes.

// What the cookie carries. Kept to a raw random value: the hash below is what gets
// stored, so the database never holds a value that could be replayed as a cookie.
export const VOTER_COOKIE = 'ct_voter';

// 30 days. Long enough that a returning visitor is not silently re-minted a token
// (and does not lose their vote history on their own issue page), short enough that a
// token left on a shared machine expires.
const VOTER_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  // 'lax' rather than 'strict': a visitor following a link into an issue from another
  // site must arrive already carrying their token, or their first vote would mint a
  // second identity and the first vote would look like someone else's.
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: VOTER_COOKIE_MAX_AGE,
};

// SHA-256 of the token, hex. Not for secrecy — a vote is not a secret — but so a leaked
// table yields hashes that cannot simply be pasted into a Cookie header.
const hashToken = (token) =>
  createHash('sha256').update(token).digest('hex');

// Resolve the caller's identity from the request, minting a token cookie if they have
// neither an account nor a token yet. Returns `{ userId, tokenHash, issuedToken }`,
// where issuedToken is non-null only when a new cookie was minted, so the controller
// sets exactly one Set-Cookie on exactly the requests that need it.
//
// Mints on a WRITE, not a read: listing votes for a public issue must not hand every
// visitor a cookie, and must not need one either.
export const resolveVoter = async (req, res) => {
  const userId = req.user?.id ?? null;

  if (userId) {
    // Signed in, the token plays no part in this write and is left alone. Clearing it
    // was the obvious tidy-up and is wrong: an anonymous vote already cast under this
    // token becomes un-removable, because the only handle on that row is the token the
    // caller just lost. The token staying put is also what makes it a stable browser
    // identity, which is the entire point of it.
    return { userId, tokenHash: null, issuedToken: null };
  }

  let token = req.cookies?.[VOTER_COOKIE];
  let issuedToken = null;

  // A malformed or wrong-length cookie is replaced rather than rejected: it can only
  // be stale or tampered with, and failing the request would block a legitimate
  // visitor over a corrupt cookie they cannot see or clear themselves.
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    token = randomBytes(32).toString('hex');
    issuedToken = token;
    res.cookie?.(VOTER_COOKIE, token, cookieOptions);
  }

  return { userId: null, tokenHash: hashToken(token), issuedToken };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

// The count, on its own. Split from the caller's own state so a visitor with no
// identity at all can still be shown the total without being issued a cookie.
export const getCounts = async (issueId) => {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS vote_count,
            COALESCE(SUM(user_id IS NOT NULL), 0) AS registered_votes
     FROM votes
     WHERE issue_id = ?`,
    [issueId],
  );

  return {
    voteCount: Number(row.vote_count),
    registeredVotes: Number(row.registered_votes),
  };
};

// Has this caller already voted? A signed-in user is only ever matched on user_id, and
// an anonymous one only on token, so a signed-in voter is never told they voted because
// of a token left on a shared machine.
export const hasVoted = async (issueId, { userId, tokenHash }) => {
  if (!userId && !tokenHash) {
    return false;
  }

  const [rows] = await db.query(
    `SELECT id FROM votes WHERE issue_id = ? AND ${
      userId ? 'user_id = ?' : 'voter_token = ?'
    } LIMIT 1`,
    [issueId, userId ?? tokenHash],
  );

  return Boolean(rows[0]);
};

// Counts and the caller's own vote state in one pass, because the button needs both
// and two round trips would let the count and the button disagree — a vote that
// appears to have worked while the badge still shows the old number.
export const getVoteSummary = async (issueId, voter) => ({
  ...(await getCounts(issueId)),
  hasVoted: await hasVoted(issueId, voter),
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

// Toggle rather than separate add/remove endpoints: the only two things a visitor can
// do to a vote is give it or take it back, and a single endpoint cannot drift out of
// step with the button's two states.
//
// A vote is removed on the second call. That is the behaviour people expect from a
// heart, and it also means a misclick is recoverable without an admin.
export const toggleVote = async (issueId, voter) => {
  const { userId, tokenHash } = voter;

  const [existing] = await db.query(
    `SELECT id FROM votes WHERE issue_id = ? AND ${
      userId ? 'user_id = ?' : 'voter_token = ?'
    } LIMIT 1`,
    [issueId, userId ?? tokenHash],
  );

  if (existing[0]) {
    await db.query('DELETE FROM votes WHERE id = ?', [existing[0].id]);
    return { voted: false };
  }

  try {
    await db.query(
      `INSERT INTO votes (id, issue_id, user_id, voter_token)
       VALUES (?, ?, ?, ?)`,
      [randomUUID(), issueId, userId, userId ? null : tokenHash],
    );
  } catch (error) {
    // Two concurrent taps on the same issue. The unique index caught it, which is the
    // guarantee the whole design leans on — report the state the caller ended up in
    // rather than a bare 409, so the button settles on "voted" instead of looking
    // broken.
    if (error.code === 'ER_DUP_ENTRY') {
      return { voted: true };
    }
    throw error;
  }

  return { voted: true };
};

// Used by the controller to return the count alongside the new state, so the badge
// and the button can never disagree about what just happened.
export const summariseFor = (issueId, voter) =>
  getVoteSummary(issueId, voter);

export const assertIssueExists = async (issueId) => {
  const [rows] = await db.query('SELECT id FROM issues WHERE id = ?', [issueId]);
  if (!rows[0]) {
    throw new ApiError(404, 'Issue not found');
  }
};
