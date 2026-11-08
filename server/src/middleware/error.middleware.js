// ============================================
// error.middleware.js - Global Error Handling
// ============================================
// Express 5 forwards rejected async handlers here automatically.
// The real error message is always returned (never swallowed) so the UI can show
// the true cause; stack traces are only logged server-side.
// ============================================

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (res.headersSent) return next(err);

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Something went wrong on the server.';

  if (err.name === 'MulterError') {
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'The uploaded file is too large.' : `Upload error: ${err.message}`;
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Request body is not valid JSON.';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large.';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for "${err.path}".`;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors || {}).map((e) => e.message).join(' ') || message;
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'A record with that value already exists.';
  } else if (err.name === 'MongoServerSelectionError' || err.name === 'MongooseServerSelectionError') {
    statusCode = 503;
    message = 'The database is unreachable right now.';
  }

  // In production, unexpected failures (no explicit statusCode) must not leak internals.
  // Errors raised deliberately with a statusCode (e.g. AI provider failures) keep their message.
  if (statusCode >= 500 && !err.statusCode && process.env.NODE_ENV === 'production') {
    message = 'Something went wrong on the server. Please try again.';
  }

  if (statusCode >= 500) console.error('Error:', err);
  else console.warn(`Request error ${statusCode}: ${message}`);

  res.status(statusCode).json({ success: false, message });
};
