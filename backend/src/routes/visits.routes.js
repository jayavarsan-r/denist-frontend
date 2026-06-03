const router = require('express').Router();
const ctrl = require('../controllers/visits.controller');
const auth = require('../middleware/auth');

router.use(auth);
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);

module.exports = router;
