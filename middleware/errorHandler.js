
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  if (err.code === '23505') {
    statusCode = 409;
    message = 'Duplicate entry - record already exists';
  }

  if (err.code === '23503') {
    statusCode = 400;
    message = 'Referenced record not found';
  }

  if (err.name === 'ZodError') {
    statusCode = 400;
    message = 'Validation failed';
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message, details: err.errors }
    });
  }

  if (!err.isOperational) {
    console.error('UNEXPECTED ERROR:', err);
  }

  res.status(statusCode).json({
    success: false,
    error: { message, ...(process.env.NODE_ENV === 'development' && { stack: err.stack }) }
  });
};

export default errorHandler;
