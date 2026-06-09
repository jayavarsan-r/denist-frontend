const router = require('express').Router();
const auth = require('../middleware/auth');
const requireClinic = require('../middleware/requireClinic');
const validate = require('../middleware/validate');
const v = require('../validators');
const repos = require('../repositories');
const audit = require('../services/audit.service');

const scopeOf = (req) => ({ clinicId: req.clinicId, dentistId: req.dentistId });

// Map a validated camelCase body to the lab_orders snake_case columns.
function toRow(b) {
  const row = {};
  const m = {
    patientId: 'patient_id', treatmentPlanId: 'treatment_plan_id',
    procedureType: 'procedure_type', toothNumber: 'tooth_number',
    labName: 'lab_name', workDescription: 'work_description', shade: 'shade',
    impressionType: 'impression_type', sentDate: 'sent_date',
    expectedReturnDate: 'expected_return_date', actualReturnDate: 'actual_return_date',
    status: 'status', costToClinic: 'cost_to_clinic', chargedToPatient: 'charged_to_patient',
    reportUrl: 'report_url', notes: 'notes',
  };
  for (const [k, col] of Object.entries(m)) if (b[k] !== undefined) row[col] = b[k];
  return row;
}

router.use(auth);

// GET /api/lab-orders — clinic-wide list (finance/lab screen). Optional ?status= filter.
router.get('/', requireClinic, async (req, res, next) => {
  try {
    const filters = {};
    if (req.query.status) filters.status = req.query.status;
    // Join patient name so the finance/lab list can label each order.
    const orders = await repos.labOrders.findAll(scopeOf(req), { select: '*, patients(name)', filters });
    res.json({ labOrders: orders });
  } catch (e) { next(e); }
});

// POST /api/lab-orders — create a new lab order.
router.post('/', requireClinic, validate(v.createLabOrder), async (req, res, next) => {
  try {
    const row = toRow(req.body);
    row.clinic_id = req.clinicId;
    row.dentist_id = req.dentistId;
    if (!row.status) row.status = 'pending';
    const order = await repos.labOrders.create(row);
    audit.log({ clinicId: req.clinicId, staffId: req.staffId, requestId: req.id,
      action: 'CREATE', entityType: 'lab_order', entityId: order.id,
      metadata: { patientId: order.patient_id, labName: order.lab_name } });
    res.status(201).json({ labOrder: order });
  } catch (e) { next(e); }
});

// PATCH /api/lab-orders/:id — update status / mark received / attach report.
router.patch('/:id', requireClinic, validate(v.updateLabOrder), async (req, res, next) => {
  try {
    const patch = toRow(req.body);
    // Convenience: marking 'received' stamps the actual return date if not given.
    if (patch.status === 'received' && !patch.actual_return_date) {
      patch.actual_return_date = new Date().toISOString().split('T')[0];
    }
    patch.updated_at = new Date().toISOString();
    const order = await repos.labOrders.update(req.params.id, scopeOf(req), patch);
    if (!order) return res.status(404).json({ error: 'Lab order not found' });
    audit.log({ clinicId: req.clinicId, staffId: req.staffId, requestId: req.id,
      action: 'UPDATE', entityType: 'lab_order', entityId: order.id,
      metadata: { status: order.status } });
    res.json({ labOrder: order });
  } catch (e) { next(e); }
});

// DELETE /api/lab-orders/:id — soft delete.
router.delete('/:id', requireClinic, async (req, res, next) => {
  try {
    await repos.labOrders.softDelete(req.params.id, scopeOf(req), req.staffId);
    audit.log({ clinicId: req.clinicId, staffId: req.staffId, requestId: req.id,
      action: 'DELETE', entityType: 'lab_order', entityId: req.params.id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
