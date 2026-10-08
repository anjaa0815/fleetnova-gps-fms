export const errorHandler = (err, req, res, next) => {
  // A malformed id in the URL (MongoDB cannot cast it) is simply not found, as it is with the JSON store
  if (err.name === 'CastError' && err.path === '_id') {
    return res.status(404).json({ success: false, message: 'Not found', stack: null });
  }

  console.error('[FLEETNOVA Error]', err);

  const statusCode = err.statusCode || (res.statusCode === 200 ? 500 : res.statusCode);

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
};

export const notFound = (req, res, next) => {
  const error = new Error(`Resource Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};
