import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError.js';

export const protect = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

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