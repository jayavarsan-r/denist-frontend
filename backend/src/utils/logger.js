// Minimal structured logger. Emits single-line JSON in production (greppable in
// Render logs) and readable text in development. No PHI should be passed in fields.

const isProd = process.env.NODE_ENV === 'production';

function emit(level, msg, fields = {}) {
  if (isProd) {
    process.stdout.write(JSON.stringify({ level, msg, ts: new Date().toISOString(), ...fields }) + '\n');
  } else {
    const tail = Object.keys(fields).length ? ' ' + JSON.stringify(fields) : '';
    // eslint-disable-next-line no-console
    console.log(`[${level}] ${msg}${tail}`);
  }
}

module.exports = {
  info:  (msg, fields) => emit('info', msg, fields),
  warn:  (msg, fields) => emit('warn', msg, fields),
  error: (msg, fields) => emit('error', msg, fields),
  // Build the per-request context fields once auth has populated req.
  reqContext: (req) => ({
    requestId: req.id,
    clinicId: req.clinicId || null,
    staffId: req.staffId || null,
    route: `${req.method} ${req.baseUrl || ''}${req.path || ''}`,
  }),
};
