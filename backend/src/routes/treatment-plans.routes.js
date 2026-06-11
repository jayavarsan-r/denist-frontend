const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const repos = require('../repositories');
const transaction = require('../services/transaction.service');

const scopeOf = (req) => ({ clinicId: req.clinicId, dentistId: req.dentistId });

router.post('/', auth, validate(v.createTreatmentPlan), async (req, res, next) => {
  try {
    const { patientId, diagnosis, procedureName, totalSittings, estimatedCost, notes, startDate, expectedEndDate } = req.body;
    const plan = await transaction.createTreatmentPlan({
      clinicId: req.clinicId, dentistId: req.dentistId, staffId: req.staffId, requestId: req.id,
      patientId, diagnosis, procedureName, totalSittings, estimatedCost, notes, startDate, expectedEndDate,
      metadata: req.body.metadata,
    });
    res.status(201).json({ plan });
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const select = '*, visits(id, visit_date, sitting_number, status, procedure_name, cost), appointments(id, appointment_date, appointment_time, sitting_number, status, purpose)';
    const plan = await repos.treatmentPlans.findById(req.params.id, scopeOf(req), select);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json({ plan });
  } catch (err) { next(err); }
});

router.patch('/:id', auth, validate(v.updateTreatmentPlan), async (req, res, next) => {
  try {
    const scope = scopeOf(req);
    const updates = { updated_at: new Date().toISOString() };
    if (req.body.completedSittings !== undefined) updates.completed_sittings = req.body.completedSittings;
    if (req.body.collectedAmount !== undefined) updates.collected_amount = parseFloat(req.body.collectedAmount);
    if (req.body.status) updates.status = req.body.status;
    if (req.body.estimatedCost !== undefined) updates.estimated_cost = parseFloat(req.body.estimatedCost);
    if (req.body.notes) updates.notes = req.body.notes;
    if (req.body.metadata !== undefined) updates.metadata = req.body.metadata;

    // Recalculate pending_amount when cost or collected changes (audit rec #4).
    if (updates.estimated_cost !== undefined || updates.collected_amount !== undefined) {
      const cur = await repos.treatmentPlans.findById(req.params.id, scope, 'estimated_cost, collected_amount');
      if (cur) {
        const est = updates.estimated_cost ?? parseFloat(cur.estimated_cost || 0);
        const col = updates.collected_amount ?? parseFloat(cur.collected_amount || 0);
        updates.pending_amount = Math.max(0, est - col);
      }
    }

    let plan;
    try {
      plan = await repos.treatmentPlans.update(req.params.id, scope, updates);
    } catch (e) {
      // pending_amount may be a GENERATED column on the live DB — retry without it.
      delete updates.pending_amount;
      plan = await repos.treatmentPlans.update(req.params.id, scope, updates);
    }
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json({ plan });
  } catch (err) { next(err); }
});

// DELETE /api/treatment-plans/:id — soft delete (requires migration 004)
router.delete('/:id', auth, async (req, res, next) => {
  try {
    await repos.treatmentPlans.softDelete(req.params.id, scopeOf(req), req.staffId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
