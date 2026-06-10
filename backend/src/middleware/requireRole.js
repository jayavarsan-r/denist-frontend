const { AppError } = require('../utils/errors');

// Role gate factory. Authorization model is clinic_id + role.
// Usage: router.patch('/', auth, requireRole('doctor'), handler)
// Requires clinic context (role only means something inside a clinic).
module.exports = (...allowed) => (req, res, next) => {
  if (!req.clinicId) {
    return next(new AppError('FORBIDDEN', 'No clinic context for this account'));
  }
  if (!allowed.includes(req.role)) {
    return next(new AppError('FORBIDDEN', `Requires role: ${allowed.join(' or ')}`));
  }
  next();
};
