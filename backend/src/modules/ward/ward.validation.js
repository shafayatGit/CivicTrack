import { z } from 'zod';

const wardNumber = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .pipe(z.string().min(1, 'Ward number is required').max(20, 'Ward number is too long'));

// Bounds follow the issue coordinates convention: coerced, so an empty form field
// arrives as '' rather than a number. An absent, empty, or null corner all mean "no
// bound", and preprocess normalises all three to null so the completeness check
// below only has to count non-nulls.
//
// preprocess rather than a union containing z.undefined(): a missing object key never
// reaches the union in Zod 4, and z.nullish().transform() crashes on 4.6.2.
const corner = (min, max, label) =>
  z
    .preprocess(
      (value) => (value === undefined || value === '' || value === null ? null : value),
      // The inner union has to accept null as well, because that is what the
      // preprocess above now hands it.
      z.union([z.string(), z.number(), z.null()]),
    )
    .transform((value) => {
      // null has to survive the transform: Number(null) is 0, and a silent 0 is
      // worse than a missing bound — it becomes a real corner in the rectangle.
      if (value === null) {
        return null;
      }
      return typeof value === 'number' ? value : Number(value);
    })
    .refine(
      (value) =>
        value === null || (Number.isFinite(value) && value >= min && value <= max),
      // NaN lands here too — a non-numeric string is not a coordinate — so the
      // message has to cover both cases.
      { message: `${label} must be a number between ${min} and ${max}` },
    );

const bounds = {
  minLatitude: corner(-90, 90, 'Minimum latitude'),
  minLongitude: corner(-180, 180, 'Minimum longitude'),
  maxLatitude: corner(-90, 90, 'Maximum latitude'),
  maxLongitude: corner(-180, 180, 'Maximum longitude'),
};

// All four or none: a rectangle missing an edge can never contain a point, so
// accepting a partial box would silently make the ward undetectable on the map.
const requireCompleteBounds = (value, ctx) => {
  const corners = [
    value.minLatitude,
    value.minLongitude,
    value.maxLatitude,
    value.maxLongitude,
  ];
  const filled = corners.filter((corner) => corner !== null).length;

  if (filled !== 0 && filled !== corners.length) {
    ctx.addIssue({
      code: 'custom',
      message: 'Give all four bounds or none of them',
      path: [filled < 2 ? 'minLatitude' : 'maxLongitude'],
    });
    return;
  }

  if (filled !== corners.length) {
    return;
  }

  if (value.minLatitude >= value.maxLatitude) {
    ctx.addIssue({
      code: 'custom',
      message: 'Minimum latitude must be below the maximum',
      path: ['minLatitude'],
    });
  }

  if (value.minLongitude >= value.maxLongitude) {
    ctx.addIssue({
      code: 'custom',
      message: 'Minimum longitude must be below the maximum',
      path: ['minLongitude'],
    });
  }
};

export const createWardSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    wardNumber,
    ...bounds,
  })
  .superRefine(requireCompleteBounds);

export const updateWardSchema = createWardSchema;
