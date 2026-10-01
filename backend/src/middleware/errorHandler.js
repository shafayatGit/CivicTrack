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
  } else if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    // A foreign key pointed at a row that does not exist. Services validate
    // references up front and throw a specific 404/400, so reaching this means a
    // check was missed — report it as a bad request rather than a server fault.
    statusCode = 400;
    message = 'Referenced record does not exist';
  } else if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    // The row is still referenced, so ON DELETE RESTRICT refused the delete.
    statusCode = 409;
    message = 'Record is still in use and cannot be removed';
  } else if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 409;
    message = 'Record already exists';
  } else if (err.code === 'ER_INNODB_AUTOEXTEND_SIZE_OUT_OF_RANGE' && /CONSTRAINT .* failed/.test(err.sqlMessage ?? '')) {
    // MariaDB 10.4 reports a failed CHECK constraint with this unrelated code (a
    // long-standing server bug — the message is the only reliable signal). Without
    // this branch a violated CHECK surfaces as an opaque 500, which reads as a server
    // fault when it is really a bad write. Keyed on the message as well as the code so
    // a genuine autoextend failure, which never mentions a constraint, still 500s.
    statusCode = 400;
    message = 'Value rejected by a database constraint';
  } else if (err.code === 'ER_DATA_TOO_LONG' || err.code === 'WARN_DATA_TRUNCATED') {
    statusCode = 400;
    message = 'A submitted value is longer than the column allows';
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