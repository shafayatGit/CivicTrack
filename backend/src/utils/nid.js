import { z } from 'zod';

// A Bangladeshi National ID is issued in three lengths: the 10-digit form, the
// 13-digit form, and the newer 17-digit form that leads with the birth year.
// Anchored and digits-only so "12345678901 " or a pasted ID with separators is
// rejected here rather than stored with stray characters.
//
// This lives in utils/ rather than in auth.validation.js because migration 018 made
// users.nid NOT NULL, so *every* path that inserts a users row has to agree on the
// rule — not just registration. The staff-onboarding path had drifted to a looser
// 4-20 digit check, which accepted values that registration rejects, and worse,
// accepted a missing nid and then let MySQL throw NOT NULL as a 500.
export const NID_PATTERN = /^(?:\d{10}|\d{13}|\d{17})$/;

export const NID_MESSAGE = 'Enter a valid National ID (10, 13, or 17 digits)';

export const nidSchema = () =>
  z
    // The schema-level message covers a missing field; without it Zod reports its
    // own "expected string, received undefined", which forms would show verbatim
    // under the input.
    .string({ error: 'National ID is required' })
    .trim()
    .regex(NID_PATTERN, NID_MESSAGE);
