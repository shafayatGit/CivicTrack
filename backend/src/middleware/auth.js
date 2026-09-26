import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';

export const protect = (req, res, next) => {
  const token =
    req.headers.authorization?.split(' ')[1] || req.cookies?.token;

  if (!token) {
    throw new ApiError(401, 'No token provided');
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    next(error);
  }
};

export const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    throw new ApiError(403, 'Admin access required');
  }
  next();
};

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
