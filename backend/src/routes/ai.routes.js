const router = require('express').Router();
const ctrl = require('../controllers/ai.controller');
const auth = require('../middleware/auth');

router.post('/transcribe', auth, ctrl.uploadMiddleware, ctrl.transcribe);
router.post('/generate-note', auth, ctrl.generateNote);
router.post('/extract-prescription', auth, ctrl.extractPrescription);
router.post('/extract-patient', auth, ctrl.extractPatient);
// Merged receptionist extraction (new canonical) + deprecated aliases.
router.post('/extract-queue-context', auth, ctrl.extractQueueContext);
router.post('/extract-patient-info', auth, ctrl.extractPatientInfo);
router.post('/extract-complaint', auth, ctrl.extractComplaint);
router.post('/parse-schedule', auth, ctrl.parseSchedule);

module.exports = router;
