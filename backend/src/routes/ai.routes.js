const router = require('express').Router();
const ctrl = require('../controllers/ai.controller');
const auth = require('../middleware/auth');

router.post('/transcribe', auth, ctrl.uploadMiddleware, ctrl.transcribe);
router.post('/generate-note', auth, ctrl.generateNote);
router.post('/extract-complaint', auth, ctrl.extractComplaint);
router.post('/extract-patient', auth, ctrl.extractPatient);
router.post('/extract-prescription', auth, ctrl.extractPrescription);
router.post('/extract-patient-info', auth, ctrl.extractPatientInfo);

module.exports = router;
