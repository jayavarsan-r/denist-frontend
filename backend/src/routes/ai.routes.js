const router = require('express').Router();
const ctrl = require('../controllers/ai.controller');
const auth = require('../middleware/auth');

// NOTE: /transcribe stays for the NON-consult voice features (check-in complaint,
// patient registration, standalone prescription). The consult pipeline is async:
// POST /api/queue/:id/start-voice → worker → consultation_drafts.
// (/generate-note was the old sync consult flow — deleted in Phase 2.)
router.post('/transcribe', auth, ctrl.uploadMiddleware, ctrl.transcribe);
router.post('/extract-prescription', auth, ctrl.extractPrescription);
router.post('/extract-patient', auth, ctrl.extractPatient);
// Merged receptionist extraction (new canonical) + deprecated aliases.
router.post('/extract-queue-context', auth, ctrl.extractQueueContext);
router.post('/extract-patient-info', auth, ctrl.extractPatientInfo);
router.post('/extract-complaint', auth, ctrl.extractComplaint);
router.post('/parse-schedule', auth, ctrl.parseSchedule);

module.exports = router;
