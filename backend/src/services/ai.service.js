// Backward-compat shim. The AI layer now lives under services/ai/ (provider
// pattern). Existing imports — `require('../services/ai.service')` — keep working.
module.exports = require('./ai/ai.service');
