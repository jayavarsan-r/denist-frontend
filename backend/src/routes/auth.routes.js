const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');

// OTP endpoints intentionally have NO new validation middleware — the mocked OTP
// flow is preserved exactly as-is (existing inline checks remain in the controller).
router.post('/send-otp', ctrl.sendOtp);
router.post('/verify-otp', ctrl.verifyOtp);
router.get('/me', auth, ctrl.getMe);
router.put('/profile', auth, ctrl.updateProfile);
router.post('/create-clinic', auth, validate(v.createClinic), ctrl.createClinic);
router.post('/lookup-clinic', auth, validate(v.lookupClinic), ctrl.lookupClinic);
router.post('/join-clinic', auth, validate(v.joinClinic), ctrl.joinClinic);

module.exports = router;
