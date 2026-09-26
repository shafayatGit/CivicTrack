import multer from 'multer';
import ApiError from '../utils/ApiError.js';

// memoryStorage keeps the file in RAM and streams it straight to Cloudinary in
// issuePhoto.service, so nothing lands on this machine's disk. That is only
// defensible because of the hard limits below — without them, memoryStorage is a
// trivial memory-exhaustion vector.
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

// Cloudinary is configured from the env in src/config/cloudinary.js. Uploads fail
// with an opaque provider error if the env vars are missing, so check up front and
// say so plainly rather than surfacing a 500 from deep inside the SDK.
const assertConfigured = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new ApiError(
      503,
      'Photo upload is not configured: missing CLOUDINARY_* environment variables',
    );
  }
};

export const uploadIssuePhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 4 },
  fileFilter: (req, file, cb) => {
    const extension = `.${file.originalname.split('.').pop()?.toLowerCase() ?? ''}`;

    if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(extension)) {
      return cb(
        new ApiError(400, 'Only JPEG, PNG, WebP or GIF images are allowed'),
      );
    }

    return cb(null, true);
  },
}).single('photo');

export const issuePhotoUpload = (req, res, next) => {
  assertConfigured();
  uploadIssuePhoto(req, res, (error) => {
    if (error) {
      // Multer surfaces its own limit violations as generic Errors; translate the
      // two that a client can actually act on.
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(
          new ApiError(413, `File exceeds the ${MAX_FILE_SIZE / 1024 / 1024}MB limit`),
        );
      }
      if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') {
        return next(new ApiError(400, 'Send exactly one file in the "photo" field'));
      }
      return next(error);
    }

    if (!req.file) {
      return next(new ApiError(400, 'No file uploaded in the "photo" field'));
    }

    return next();
  });
};
