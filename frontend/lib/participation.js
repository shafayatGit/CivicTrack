// Mirrors `allowsParticipation` in backend/src/utils/participation.js. The server is
// authoritative and refuses a staff or admin write with a 403; this exists so the UI
// does not offer a button that is guaranteed to fail.
//
// Both sides must change together. If a role is added here but not there, officials get a
// control that 403s; if it is added there but not here, the control is silently missing.
export const PARTICIPATION_BLOCKED_ROLES = ["staff", "admin"];

export const allowsParticipation = (role) =>
  !PARTICIPATION_BLOCKED_ROLES.includes(role ?? null);