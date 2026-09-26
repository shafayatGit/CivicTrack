import { randomUUID } from 'crypto';
import db from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { buildMeta, limitClause, paginationSchema } from '../../utils/pagination.js';

// The request body is camelCase (the API contract) and the columns are snake_case,
// so the pairing is declared once here and used for both the SQL and the argument
// list. Reading payload[column] instead silently writes NULL for every bound, which
// looks like a working save right up until the map stops auto-selecting.
const BOUND_COLUMNS = [
  { column: 'min_latitude', key: 'minLatitude' },
  { column: 'min_longitude', key: 'minLongitude' },
  { column: 'max_latitude', key: 'maxLatitude' },
  { column: 'max_longitude', key: 'maxLongitude' },
];

const COLUMNS = `id, name, ward_number, ${BOUND_COLUMNS.map((b) => b.column).join(', ')}, created_at, updated_at`;

// The bound columns travel together in and out of the service as one object, so the
// INSERT and UPDATE placeholders are generated from the same list. Writing four
// separate '?'s in both statements is how the argument order silently drifts.
const boundPlaceholders = BOUND_COLUMNS.map(() => '?').join(', ');

const toBoundValues = (payload = {}) =>
  BOUND_COLUMNS.map(({ key }) => payload[key] ?? null);

// ward_number carries a UNIQUE index (migration 005) because it is the stable public
// identifier — the display name is not. Checked here anyway so the caller gets a 409
// naming the field instead of a raw ER_DUP_ENTRY from the error handler.
const findByWardNumber = async (wardNumber, exceptId = null) => {
  const [rows] = await db.query(
    'SELECT id FROM wards WHERE ward_number = ? AND id <> ?',
    [wardNumber, exceptId ?? ''],
  );
  return rows[0];
};

const ensureWardNumberAvailable = async (wardNumber, exceptId = null) => {
  if (await findByWardNumber(wardNumber, exceptId)) {
    throw new ApiError(409, 'Ward number already exists');
  }
};

export const createWard = async (payload) => {
  const { name, wardNumber } = payload;
  await ensureWardNumberAvailable(wardNumber);

  const id = randomUUID();
  await db.query(
    `INSERT INTO wards (id, name, ward_number, ${BOUND_COLUMNS.map((b) => b.column).join(', ')})
     VALUES (?, ?, ?, ${boundPlaceholders})`,
    [id, name, wardNumber, ...toBoundValues(payload)],
  );

  return getWard(id);
};

export const listWards = async (query) => {
  const { page, limit } = paginationSchema.parse(query ?? {});
  const paging = { page, limit, offset: (page - 1) * limit };

  const [rows] = await db.query(
    `SELECT w.id, w.name, w.ward_number,
            ${BOUND_COLUMNS.map(({ column }) => `w.${column}`).join(', ')},
            w.created_at, w.updated_at,
            COUNT(i.id) AS issue_count
     FROM wards w
     LEFT JOIN issues i ON i.ward_id = w.id
     GROUP BY w.id, w.name, w.ward_number, ${BOUND_COLUMNS.map(({ column }) => `w.${column}`).join(', ')}, w.created_at, w.updated_at
     ORDER BY w.ward_number
     ${limitClause(paging)}`,
  );

  const [countRows] = await db.query('SELECT COUNT(*) AS total FROM wards');

  return { items: rows, pagination: buildMeta(paging, countRows[0].total) };
};

const findById = async (id) => {
  const [rows] = await db.query(`SELECT ${COLUMNS} FROM wards WHERE id = ?`, [id]);
  return rows[0];
};

export const getWard = async (id) => {
  const ward = await findById(id);
  if (!ward) {
    throw new ApiError(404, 'Ward not found');
  }
  return ward;
};

export const updateWard = async (id, payload) => {
  const { name, wardNumber } = payload;
  await getWard(id);
  await ensureWardNumberAvailable(wardNumber, id);

  await db.query(
    `UPDATE wards
     SET name = ?, ward_number = ?, ${BOUND_COLUMNS.map(({ column }) => `${column} = ?`).join(', ')}
     WHERE id = ?`,
    [name, wardNumber, ...toBoundValues(payload), id],
  );

  return getWard(id);
};

export const deleteWard = async (id) => {
  await getWard(id);

  // issues.ward_id is ON DELETE RESTRICT, so a ward that has ever been reported
  // against cannot be removed. Naming the count beats surfacing ER_ROW_IS_REFERENCED_2.
  const [issueRows] = await db.query(
    'SELECT COUNT(*) AS total FROM issues WHERE ward_id = ?',
    [id],
  );
  if (issueRows[0].total > 0) {
    throw new ApiError(
      409,
      `Cannot delete: ${issueRows[0].total} issue(s) are reported in this ward`,
    );
  }

  await db.query('DELETE FROM wards WHERE id = ?', [id]);
};
