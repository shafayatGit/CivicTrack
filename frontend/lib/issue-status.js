// The four statuses are an ENUM on issues.status and the same four strings are
// written to status_history, so this list mirrors ISSUE_STATUSES in
// backend/src/modules/issue/issue.service.js.
export const ISSUE_STATUSES = [
  "Reported",
  "Acknowledged",
  "In Progress",
  "Resolved",
];

// Legal status moves, copied from ALLOWED_TRANSITIONS in the issue service. The
// server rejects anything else, so the UI only ever offers these — otherwise a
// staff member would pick a legal-looking move and get a 400 back.
const ALLOWED_TRANSITIONS = {
  Reported: ["Acknowledged", "In Progress"],
  Acknowledged: ["In Progress", "Reported"],
  "In Progress": ["Resolved", "Acknowledged"],
  Resolved: ["In Progress"],
};

export const nextStatuses = (status) => ALLOWED_TRANSITIONS[status] ?? [];

// Badge variants are keyed to the four states, using the shadcn badge variants
// that already exist in components/ui/badge.jsx.
const STATUS_VARIANTS = {
  Reported: "outline",
  Acknowledged: "secondary",
  "In Progress": "default",
  Resolved: "secondary",
};

export const statusVariant = (status) => STATUS_VARIANTS[status] ?? "outline";

export const RESOLVED = "Resolved";
