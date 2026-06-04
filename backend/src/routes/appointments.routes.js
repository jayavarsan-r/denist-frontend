const router = require('express').Router();
const ctrl = require('../controllers/appointments.controller');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');

router.use(auth);
router.get('/today', ctrl.today);
router.get('/upcoming', ctrl.upcoming);
router.get('/booked-slots', ctrl.bookedSlots);
router.get('/', ctrl.list);
router.post('/', validate(v.createAppointment), ctrl.create);
router.put('/:id', validate(v.updateAppointment), ctrl.update);

module.exports = router;
