const { AppError } = require('../utils/errors');

// Guard for endpoints that operate on clinic-scoped data. Authorization is
// clinic_id-based (never dentist_id). Rejects requests without clinic context.
module.exports = (req, res, next) => {
  if (!req.clinicId) {
    return next(new AppError('FORBIDDEN', 'No clinic context for this account'));
  }
  next();
};
