import ApiError from '../utils/ApiError.js';

const errorHandler = (err, req, res, next) => {
  let { statusCode = 500, message = 'Internal Server Error' } = err;

  if (err.name === 'ZodError') {
    statusCode = 400;
    message = 'Validation failed';
    err.details = err.issues;
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (err.code === 'ER_BAD_DB_ERROR' || err.code === 'ECONNREFUSED') {
    statusCode = 500;
    message = 'Database connection error';
  }

  if (process.env.NODE_ENV === 'production') {
    return res.status(statusCode).json({ success: false, message, details: err.details });
  }

  return res.status(statusCode).json({
    success: false,
    message,
    details: err.details,
    stack: err.stack,
  });
};

export { errorHandler, ApiError };