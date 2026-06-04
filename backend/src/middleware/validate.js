const { fail } = require('../utils/response');

// Zod middleware factory — validates req.body against a Zod schema
// Usage: router.post('/...', validate(mySchema), handler)
module.exports = function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return fail(res, 400, 'VALIDATION_ERROR', 'Request validation failed', details);
    }
    req.body = result.data;
    next();
  };
};
