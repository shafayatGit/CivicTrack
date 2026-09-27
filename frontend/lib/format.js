// MySQL `datetime` has no timezone and the API serialises it as a naive ISO-ish
// string, so the value is formatted as UTC to keep every client rendering the same
// wall-clock time the server stored.
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const parse = (value) => {
  if (!value) {
    return null;
  }

  // Bare "2026-01-31 09:15:00" is not valid ISO, and Safari rejects it outright.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateTime = (value) => {
  const date = parse(value);
  return date ? dateTimeFormat.format(date) : "—";
};

export const formatDate = (value) => {
  const date = parse(value);
  return date ? dateFormat.format(date) : "—";
};

// "3 days ago" for list rows, where the exact timestamp is noise.
export const formatRelative = (value) => {
  const date = parse(value);
  if (!date) {
    return "—";
  }

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }

  const days = Math.round(hours / 24);
  if (days < 30) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return dateFormat.format(date);
};

// MySQL hands back computed aggregates (COUNT, SUM, and anything COALESCE-wrapped)
// as strings, so a count arriving as "12" is normal rather than a type error.
// Anything that has to do arithmetic on those values needs the number, not the
// formatted string, so the coercion is exported on its own.
export const toNumber = (value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : 0;
};

// Coerce before formatting, and treat a missing value as zero so a column that
// legitimately has no value still renders instead of blanking the table cell.
export const formatNumber = (value) => new Intl.NumberFormat("en-US").format(toNumber(value));

export const initials = (name) =>
  (name ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

// Coordinates are stored as two DECIMAL columns and returned as strings by
// mysql2, so they are trimmed rather than re-formatted as numbers.
export const formatCoords = (latitude, longitude) => {
  if (latitude === null || latitude === undefined) {
    return "—";
  }

  return `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;
};
