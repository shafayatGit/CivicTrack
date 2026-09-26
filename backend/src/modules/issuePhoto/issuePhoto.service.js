import { randomUUID } from 'crypto';
import db from '../../config/db.js';
import cloudinary from '../../config/cloudinary.js';
import ApiError from '../../utils/ApiError.js';

const COLUMNS = 'id, issue_id, photo_url, uploaded_at';

const assertIssueExists = async (conn, issueId) => {
  const [rows] = await conn.query('SELECT id FROM issues WHERE id = ?', [issueId]);
  if (!rows[0]) {
    throw new ApiError(404, 'Issue not found');
  }
};

// The column is provider-agnostic by design (migration 009), so the service only
// ever stores a URL and never assumes where it came from. Both entry points below end
// at the same INSERT.
export const addPhotoByUrl = async ({ issueId, photoUrl }) => {
  await assertIssueExists(db, issueId);

  const id = randomUUID();
  await db.query(
    'INSERT INTO issue_photos (id, issue_id, photo_url) VALUES (?, ?, ?)',
    [id, issueId, photoUrl],
  );

  return getPhoto(id);
};

const uploadToCloudinary = (buffer, options) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) {
        return reject(error);
      }
      return resolve(result);
    });

    stream.end(buffer);
  });

// multer is configured with memoryStorage (see middleware/upload.js), so the buffer
// is streamed straight to Cloudinary rather than base64-encoded into a Data URI. That
// avoids inflating the payload by a third and keeps peak memory at one file.
export const uploadPhoto = async ({ issueId, file }) => {
  await assertIssueExists(db, issueId);

  let result;
  try {
    result = await uploadToCloudinary(file.buffer, {
      folder: 'civictrack/issues',
      resource_type: 'image',
    });
  } catch (error) {
    // A provider outage should not look like a client error, and the raw SDK message
    // is not something to hand back verbatim.
    throw new ApiError(502, `Photo upload failed: ${error.message}`);
  }

  const id = randomUUID();
  await db.query(
    'INSERT INTO issue_photos (id, issue_id, photo_url) VALUES (?, ?, ?)',
    [id, issueId, result.secure_url],
  );

  return getPhoto(id);
};

export const listPhotosByIssue = async (issueId) => {
  await assertIssueExists(db, issueId);

  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM issue_photos WHERE issue_id = ? ORDER BY uploaded_at ASC, id ASC`,
    [issueId],
  );

  return rows;
};

const findById = async (id) => {
  const [rows] = await db.query(
    `SELECT ${COLUMNS} FROM issue_photos WHERE id = ?`,
    [id],
  );
  return rows[0];
};

export const getPhoto = async (id) => {
  const photo = await findById(id);
  if (!photo) {
    throw new ApiError(404, 'Photo not found');
  }
  return photo;
};

// issue_photos only stores the URL, so the Cloudinary public_id has to be recovered
// from it. A standard delivery URL looks like
//   https://res.cloudinary.com/<cloud>/image/upload/v<version>/<public_id>.<ext>
// which is a fixed shape, but nothing guarantees the stored URL was produced by
// Cloudinary at all. So this is best-effort by design: a URL that does not match is
// skipped and the row is still deleted, because a stale remote asset is a far
// smaller problem than a photo row that cannot be removed.
//
// If public_id ever needs to be stored properly, that is an ADD COLUMN in a new
// 017_*.sql — not a wider parsing hack here.
const publicIdFromUrl = (url) => {
  const match = url.match(
    /\/image\/(?:upload|fetch)\/v\d+\/(.+)\.[a-z0-9]+$/i,
  );
  return match ? match[1] : null;
};

export const deletePhoto = async (id) => {
  const photo = await getPhoto(id);

  await db.query('DELETE FROM issue_photos WHERE id = ?', [id]);

  const publicId = publicIdFromUrl(photo.photo_url);
  if (!publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // The row is already gone, which is what the caller asked for. Failing the
    // request here would report a delete that in fact succeeded as an error.
  }
};
