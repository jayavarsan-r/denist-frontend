const { fail } = require('../utils/response');

// Factory: requireRole(['doctor']) — restrict route to specific roles
// Usage: router.post('/...', auth, requireRole(['doctor']), handler)
module.exports = function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.role || !allowedRoles.includes(req.role)) {
      return fail(res, 403, 'FORBIDDEN',
        `This action requires one of the following roles: ${allowedRoles.join(', ')}`);
    }
    next();
  };
};
