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