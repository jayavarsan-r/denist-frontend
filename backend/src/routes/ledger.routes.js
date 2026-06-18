const router = require('express').Router();
const ctrl = require('../controllers/ledger.controller');
const auth = require('../middleware/auth');
const requireClinic = require('../middleware/requireClinic');
const validate = require('../middleware/validate');
const v = require('../validators');

router.use(auth);
router.use(requireClinic); // manual ledger is strictly clinic-scoped
router.get('/', ctrl.list);
router.post('/', validate(v.createLedgerEntry), ctrl.create);
router.put('/:id', validate(v.updateLedgerEntry), ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
