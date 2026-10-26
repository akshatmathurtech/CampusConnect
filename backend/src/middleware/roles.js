const ApiError = require('../utils/ApiError');

exports.requireStudent = (req, _res, next) => {
  if (!req.user || req.user.role !== 'student') return next(new ApiError(403, 'This action is available to students only.'));
  next();
};

exports.requireAdmin = (req, _res, next) => {
  if (!req.user || req.user.role !== 'admin') return next(new ApiError(403, 'Administrator access required.'));
  next();
};
