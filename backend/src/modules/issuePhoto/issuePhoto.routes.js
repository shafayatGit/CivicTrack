import { Router } from 'express';
import * as issuePhotoController from './issuePhoto.controller.js';
import {
  photoByUrlSchema,
  photoIssueIdSchema,
} from './issuePhoto.validation.js';
import validate from '../../middleware/validate.js';
import { issuePhotoUpload } from '../../middleware/upload.js';
import { protect, adminOnly, optionalAuth } from '../../middleware/auth.js';
import { canManageIssuePhotos } from '../../middleware/issuePhotoAccess.js';

const router = Router();

// Reads are open to anyone, including a visitor with no account: the report itself is
// public at /issues/:id, and a photo is usually the whole point of the report. The
// image is served from the issue row the reader could already fetch, so nothing is
// exposed here that the detail page does not link to anyway.
// Writes go through canManageIssuePhotos rather than a role check — admins always,
// the reporting citizen only while the issue is still 'Reported'. See
// middleware/issuePhotoAccess.js for why that middle is closed.
//
// That middleware reads req.body.issueId, which for the multipart route only exists
// after multer has parsed the body — so the file is buffered before it is
// authorized. The cost is bounded: `protect` has already run on the write routes, so
// only a signed-in user reaches multer, and its 5MB/one-file limits cap what an
// unauthorized caller can make the server hold. Moving the check earlier would mean
// trusting an id from the query string instead of the body, which is worse.
router.get('/issue/:issueId', optionalAuth, issuePhotoController.listPhotosByIssue);
router.get('/:id', optionalAuth, issuePhotoController.getPhoto);

router.post(
  '/',
  protect,
  validate(photoByUrlSchema),
  canManageIssuePhotos,
  issuePhotoController.addPhotoByUrl,
);

// Declared after the JSON route on purpose: this one is multipart, and
// express.json() has already run, which is harmless — multer only reads its own
// field. The URL route above must not be shadowed by it.
router.post(
  '/upload',
  protect,
  issuePhotoUpload,
  // photoIssueIdSchema runs before canManageIssuePhotos on purpose. The access
  // middleware looks the issue up and 404s when it finds nothing, so without this a
  // malformed id ("not-a-uuid") would come back as "issue not found" instead of the
  // 400 that says the request itself is wrong.
  validate(photoIssueIdSchema),
  canManageIssuePhotos,
  issuePhotoController.uploadPhoto,
);

router.delete('/:id', protect, adminOnly, issuePhotoController.deletePhoto);

export default router;
