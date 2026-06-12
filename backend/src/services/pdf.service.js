// backend/src/services/pdf.service.js — moved into ./pdf/. Kept as a thin re-export so
// existing `require('../services/pdf.service')` callers do not break.
module.exports = require('./pdf/prescription.pdf');
