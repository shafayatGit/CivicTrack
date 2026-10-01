import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';
import db from '../config/db.js';

export const protect = async (req, res, next) => {
  const token =
    req.headers.authorization?.split(' ')[1] || req.cookies?.token;

  if (!token) {
    throw new ApiError(401, 'No token provided');
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return next(error);
  }

  // A deactivated account is refused here rather than only at login, because a JWT
  // stays valid for JWT_EXPIRES_IN (7 days by default). Checking the token alone
  // would let a banned citizen keep posting with a token minted before the
  // deactivation, for the rest of that week.
  //
  // The cost is one indexed primary-key read per authenticated request, which is
  // cheap next to the queries the route is about to run anyway. The id comes from
  // the verified payload, never from the request, so this cannot be steered.
  const [rows] = await db.query(
    'SELECT is_active FROM users WHERE id = ?',
    [payload.id],
  );

  if (!rows[0]) {
    // The account is gone entirely. 401 rather than 403 because no credential this
    // request carries can ever be valid again.
    throw new ApiError(401, 'This account no longer exists');
  }

  if (!rows[0].is_active) {
    throw new ApiError(403, 'This account has been deactivated');
  }

  req.user = payload;
  return next();
};

export const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    throw new ApiError(403, 'Admin access required');
  }
  next();
};

// `protect`, minus the requirement. On a public endpoint a visitor is allowed to act
// either signed in or not, and the difference changes what the service writes (user_id
// vs a voter token, real name vs chosen name) but never whether the request is allowed.
//
// Deliberately silent about *bad* credentials: a request with a valid token gets
// req.user, a request with no token gets none, and a request with an expired or forged
// token is treated exactly like no token. Returning 401 for a malformed token would make
// the public endpoints fail closed, which is the opposite of what they are for — and a
// stale token in a browser would break voting for someone who never needed to log in.
//
// The deactivated-account check is deliberately NOT repeated here. It already runs in
// `protect`, and an anonymous visitor has no account to deactivate. If a token is
// supplied but the account was banned, treating them as anonymous would let a banned
// citizen vote by clearing their cookie — so a *verified* token must still be checked.
const verifyIfPresent = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;

  if (!token) {
    return next();
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next();
  }

  db.query('SELECT is_active FROM users WHERE id = ?', [payload.id])
    .then(([rows]) => {
      if (rows[0]?.is_active) {
        req.user = payload;
      }
      next();
    })
    .catch(next);
};

export const optionalAuth = verifyIfPresent;

// The role half of requireRole, kept separate so the two middlewares can never be
// applied out of order.
const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    throw new ApiError(403, `Requires one of: ${roles.join(', ')}`);
  }
  next();
};

// `protect` then one of the role guards, collapsed into a single middleware so a
// route cannot accidentally ship the guard in the wrong order.
export const requireRole = (...roles) => [protect, allowRoles(...roles)];
