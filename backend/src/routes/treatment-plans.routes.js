const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
<<<<<<< HEAD
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
=======
const requireRole = require('../middleware/requireRole');
const { ok, okCreated, fail } = require('../utils/response');

router.post('/', auth, requireRole(['doctor']), async (req, res, next) => {
  try {
    const { patientId, diagnosis, procedureName, totalSittings, estimatedCost, notes, startDate, expectedEndDate } = req.body;
    if (!patientId || !procedureName) return fail(res, 400, 'VALIDATION_ERROR', 'patientId and procedureName required');

    const estimatedCostNum = estimatedCost ? parseFloat(estimatedCost) : 0;
    const { data, error } = await supabase.from('treatment_plans').insert({
      patient_id:       patientId,
      dentist_id:       req.dentistId,
      clinic_id:        req.clinicId || null,
      diagnosis:        diagnosis || null,
      procedure_name:   procedureName,
      total_sittings:   totalSittings || 1,
      completed_sittings: 0,
      estimated_cost:   estimatedCostNum,
      collected_amount: 0,
      // pending_amount is a generated column — Postgres computes it automatically
      notes:            notes || null,
      start_date:       startDate || new Date().toISOString().split('T')[0],
      expected_end_date: expectedEndDate || null,
      status:           'active',
    }).select().single();

    if (error) throw error;
    return okCreated(res, { plan: data });
>>>>>>> origin/main
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
<<<<<<< HEAD
    const select = '*, visits(id, visit_date, sitting_number, status, procedure_name, cost), appointments(id, appointment_date, appointment_time, sitting_number, status, purpose)';
    const plan = await repos.treatmentPlans.findById(req.params.id, scopeOf(req), select);
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json({ plan });
  } catch (err) { next(err); }
});

router.patch('/:id', auth, validate(v.updateTreatmentPlan), async (req, res, next) => {
  try {
    const scope = scopeOf(req);
=======
    const { data, error } = await supabase
      .from('treatment_plans')
      .select(`*, visits(id, visit_date, status, procedure_name, cost), appointments(id, appointment_date, appointment_time, status, purpose)`)
      .eq('id', req.params.id)
      .eq('dentist_id', req.dentistId)
      .single();

    if (error || !data) return fail(res, 404, 'NOT_FOUND', 'Plan not found');
    return ok(res, { plan: data });
  } catch (err) { next(err); }
});

router.patch('/:id', auth, requireRole(['doctor']), async (req, res, next) => {
  try {
>>>>>>> origin/main
    const updates = { updated_at: new Date().toISOString() };
    if (req.body.completedSittings !== undefined) updates.completed_sittings = req.body.completedSittings;
    if (req.body.status) updates.status = req.body.status;
    if (req.body.notes) updates.notes = req.body.notes;
<<<<<<< HEAD
    if (req.body.metadata !== undefined) updates.metadata = req.body.metadata;
=======

    // pending_amount is a generated column — Postgres recomputes it automatically
    // when estimated_cost or collected_amount changes. Never set it manually.
    if (req.body.estimatedCost !== undefined) {
      updates.estimated_cost = parseFloat(req.body.estimatedCost);
    }
    if (req.body.collectedAmount !== undefined) {
      updates.collected_amount = parseFloat(req.body.collectedAmount);
    }
>>>>>>> origin/main

    // Recalculate pending_amount when cost or collected changes (audit rec #4).
    if (updates.estimated_cost !== undefined || updates.collected_amount !== undefined) {
      const cur = await repos.treatmentPlans.findById(req.params.id, scope, 'estimated_cost, collected_amount');
      if (cur) {
        const est = updates.estimated_cost ?? parseFloat(cur.estimated_cost || 0);
        const col = updates.collected_amount ?? parseFloat(cur.collected_amount || 0);
        updates.pending_amount = Math.max(0, est - col);
      }
    }

<<<<<<< HEAD
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
=======
    if (error) throw error;
    return ok(res, { plan: data });
>>>>>>> origin/main
  } catch (err) { next(err); }
});

module.exports = router;
