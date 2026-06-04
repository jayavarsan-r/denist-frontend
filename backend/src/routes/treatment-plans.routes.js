const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
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
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
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
    const updates = { updated_at: new Date().toISOString() };
    if (req.body.completedSittings !== undefined) updates.completed_sittings = req.body.completedSittings;
    if (req.body.status) updates.status = req.body.status;
    if (req.body.notes) updates.notes = req.body.notes;

    // pending_amount is a generated column — Postgres recomputes it automatically
    // when estimated_cost or collected_amount changes. Never set it manually.
    if (req.body.estimatedCost !== undefined) {
      updates.estimated_cost = parseFloat(req.body.estimatedCost);
    }
    if (req.body.collectedAmount !== undefined) {
      updates.collected_amount = parseFloat(req.body.collectedAmount);
    }

    const { data, error } = await supabase.from('treatment_plans')
      .update(updates)
      .eq('id', req.params.id)
      .eq('dentist_id', req.dentistId)
      .select().single();

    if (error) throw error;
    return ok(res, { plan: data });
  } catch (err) { next(err); }
});

module.exports = router;
