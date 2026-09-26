import ApiError from '../utils/ApiError.js';
import db from '../config/db.js';

// Photos are evidence on a public report, so the write rule is narrower than a plain
// role check: an admin can always manage them, and the citizen who filed the report
// can attach evidence while it is still untouched — status 'Reported'. Once the
// department has picked the issue up, the evidence set is frozen.
//
// The old rule was adminOnly because the register form had no way to upload
// anything, so a citizen had no legitimate path to attach evidence at all. That is
// what this widens, and only as far as 'Reported'.
//
// issueId arrives in the request body rather than the path, and for the multipart
// route it arrives as a text field beside the file, so this has to read it directly
// instead of relying on a validator having run. Runs after `protect`, so req.user is
// set and req.body is already parsed (express.json() and multer have both run).
export const canManageIssuePhotos = async (req, res, next) => {
  const issueId = req.body?.issueId;

  if (typeof issueId !== 'string' || issueId.length === 0) {
    throw new ApiError(400, 'issueId is required');
  }

  const [rows] = await db.query(
    'SELECT id, user_id, status FROM issues WHERE id = ?',
    [issueId],
  );
  const issue = rows[0];

  // A 404 rather than a 403 on someone else's report: whether an id exists at all
  // is not something a non-owner needs to learn, and the two are indistinguishable
  // from the outside anyway.
  if (!issue) {
    throw new ApiError(404, 'Issue not found');
  }

  if (req.user.role === 'admin') {
    return next();
  }

  if (issue.user_id !== req.user.id) {
    throw new ApiError(403, 'You can only add photos to your own reports');
  }

  if (issue.status !== 'Reported') {
    throw new ApiError(
      403,
      `Photos are frozen once an issue leaves "Reported" (this one is ${issue.status})`,
    );
  }

  return next();
};
