// Point-in-rectangle helpers for the ward bounding boxes added in migration 019.
//
// A ward's bounds are optional: an admin has to draw them, and plenty of wards never
// will. So every function here distinguishes "this ward has no bounds configured"
// from "this point is outside this ward's bounds" — the two mean very different things
// to the person filling in the report form.

const cornersOf = (ward) => {
  const south = Number(ward?.min_latitude);
  const west = Number(ward?.min_longitude);
  const north = Number(ward?.max_latitude);
  const east = Number(ward?.max_longitude);

  if (![south, west, north, east].every(Number.isFinite)) {
    return null;
  }

  return { south, west, north, east };
};

export const hasWardBounds = (ward) => cornersOf(ward) !== null;

export const wardContainsPoint = (ward, latitude, longitude) => {
  const box = cornersOf(ward);

  if (!box) {
    return false;
  }

  return (
    latitude >= box.south &&
    latitude <= box.north &&
    longitude >= box.west &&
    longitude <= box.east
  );
};

// Resolves the point to at most one ward.
//
// `match`    the single ward containing the point, or null
// `mapped`   how many of the supplied wards actually have bounds, so the UI can stay
//            quiet when nobody has drawn a map yet instead of nagging about a
//            location that cannot be checked
// `ambiguous` more than one ward claims the point, which means the admin boxes
//            overlap and the citizen has to pick
export const findWardForPoint = (wards, latitude, longitude) => {
  const candidates = wards.filter((ward) => hasWardBounds(ward));
  const hits = candidates.filter((ward) =>
    wardContainsPoint(ward, latitude, longitude),
  );

  return {
    match: hits.length === 1 ? hits[0] : null,
    ambiguous: hits.length > 1,
    mapped: candidates.length,
  };
};

// Stable key for a coordinate pair, used to remember a deliberate per-point override
// without an effect that would have to reset state on every render.
export const coordKey = (latitude, longitude) => {
  if (latitude === "" || longitude === "") {
    return null;
  }

  return `${Number(latitude).toFixed(6)},${Number(longitude).toFixed(6)}`;
};
