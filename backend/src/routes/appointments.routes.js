const router = require('express').Router();
const ctrl = require('../controllers/appointments.controller');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/today', ctrl.today);
router.get('/upcoming', ctrl.upcoming);
router.get('/booked-slots', ctrl.bookedSlots);
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);

module.exports = router;
