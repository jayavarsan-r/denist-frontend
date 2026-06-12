const router = require('express').Router();
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const voice = require('../controllers/voice.controller');

// Verification Card data + polling fallback when realtime is down.
router.get('/:id', auth, voice.getDraft);

// Lightweight review: profile-consult confirm (records corrections, no clinical
// writes) and the reject path. Queue consults confirm via
// POST /api/queue/:id/complete-consult instead.
router.patch('/:id', auth, validate(v.reviewDraft), voice.reviewDraft);

module.exports = router;
