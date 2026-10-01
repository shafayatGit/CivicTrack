import ApiError from './ApiError.js';

// The public participation layer — votes and comments — exists to measure resident
// sentiment. A staff member or administrator is not a resident, and letting them take
// part would let an official inflate the signal on a report they are also handling: one
// extra vote on a contested issue, or an "Official" reply that reads as a neighbour's
// corroboration. So the two privileged roles are excluded from it entirely.
//
// This is deliberately about the PERSON, not the post. An administrator still moderates
// the thread — hiding and deleting other people's comments — because moderation is an
// official duty, not participation. Only the ability to add their own vote or comment is
// withdrawn. Reads are untouched for every role.
//
// Known limit, and it is not fixable here: the same endpoints accept anonymous callers,
// so a determined staffer can drop their token and post as a guest. What this rule buys
// is honesty — the app never records a staff vote or an "Official" comment on the public
// thread, and an accidental double-tap by a logged-in official is stopped at the source.
const BLOCKED_ROLES = new Set(['staff', 'admin']);

// `actor` is whatever optionalAuth produced, so a null/undefined actor is a resident and
// is always allowed.
export const allowsParticipation = (actor) =>
  !actor?.role || !BLOCKED_ROLES.has(actor.role);

export const assertCanParticipate = (actor, what) => {
  if (!allowsParticipation(actor)) {
    throw new ApiError(
      403,
      `${what} is open to residents only. Staff and administrator accounts cannot vote or comment, so official accounts cannot influence the public count.`,
    );
  }
};