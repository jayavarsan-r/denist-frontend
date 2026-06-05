const router = require('express').Router();
const ctrl = require('../controllers/visits.controller');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');

router.use(auth);
router.get('/', ctrl.list);
router.post('/', validate(v.createVisit), ctrl.create);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove); // soft delete (requires migration 004)

module.exports = router;
