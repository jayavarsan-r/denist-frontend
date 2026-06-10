const router = require('express').Router();
const ctrl = require('../controllers/appointments.controller');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
<<<<<<< HEAD
const v = require('../validators');
=======
const { createSchema, updateSchema } = require('../validators/appointment.validator');
>>>>>>> origin/main

router.use(auth);
router.get('/today', ctrl.today);
router.get('/upcoming', ctrl.upcoming);
router.get('/booked-slots', ctrl.bookedSlots);
router.get('/', ctrl.list);
<<<<<<< HEAD
router.post('/', validate(v.createAppointment), ctrl.create);
router.post('/recurring', validate(v.recurringAppointments), ctrl.createRecurring);
router.put('/:id', validate(v.updateAppointment), ctrl.update);
=======
router.post('/', validate(createSchema), ctrl.create);
router.put('/:id', validate(updateSchema), ctrl.update);
>>>>>>> origin/main

module.exports = router;
