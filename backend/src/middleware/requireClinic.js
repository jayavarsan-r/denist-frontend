const { fail } = require('../utils/response');

// Rejects requests where the JWT has no clinic context (new user mid-setup)
module.exports = (req, res, next) => {
  if (!req.clinicId) {
    return fail(res, 403, 'FORBIDDEN', 'Clinic context required. Complete clinic setup first.');
  }
  next();
};
