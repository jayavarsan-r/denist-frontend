// Structured logger — JSON in production, human-readable in development

function log(level, message, meta = {}) {
  const entry = { level, message, timestamp: new Date().toISOString(), ...meta };
  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify(entry));
  } else {
    const color = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[0m';
    console.log(`${color}[${level.toUpperCase()}]\x1b[0m ${message}`, Object.keys(meta).length ? meta : '');
  }
}

function createLogger(context = {}) {
  return {
    info:  (message, extra = {}) => log('info',  message, { ...context, ...extra }),
    warn:  (message, extra = {}) => log('warn',  message, { ...context, ...extra }),
    error: (message, extra = {}) => log('error', message, { ...context, ...extra }),
    debug: (message, extra = {}) => {
      if (process.env.NODE_ENV !== 'production') log('debug', message, { ...context, ...extra });
    },
  };
}

// Default logger with no context (use createLogger(req) in controllers)
const logger = createLogger();

module.exports = { createLogger, logger };
