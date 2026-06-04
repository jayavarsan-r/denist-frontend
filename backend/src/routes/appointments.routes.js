const router = require('express').Router();
const ctrl = require('../controllers/appointments.controller');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createSchema, updateSchema } = require('../validators/appointment.validator');

router.use(auth);
router.get('/today', ctrl.today);
router.get('/upcoming', ctrl.upcoming);
router.get('/booked-slots', ctrl.bookedSlots);
router.get('/', ctrl.list);
router.post('/', validate(createSchema), ctrl.create);
router.put('/:id', validate(updateSchema), ctrl.update);

module.exports = router;
