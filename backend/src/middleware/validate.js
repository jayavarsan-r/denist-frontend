const { AppError } = require('../utils/errors');

// Zod validation middleware. Validates a request part against a schema, and on
// success REPLACES it with the parsed value — so controllers only ever see
// whitelisted, type-coerced fields (no more `...req.body` mass assignment).
//
//   router.post('/', auth, validate(createPatientSchema), controller.create)
//   router.get('/', auth, validate(listQuerySchema, 'query'), controller.list)
module.exports = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] || {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || '(root)',
      message: i.message,
    }));
    return next(new AppError('VALIDATION_ERROR', 'Validation failed', details));
  }
  // req.query can be a read-only getter on some Express versions; assign defensively.
  try { req[source] = result.data; } catch { Object.defineProperty(req, source, { value: result.data, writable: true }); }
  next();
};
