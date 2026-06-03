const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');

router.post('/', auth, async (req, res, next) => {
  try {
    const { patientId, diagnosis, procedureName, totalSittings, estimatedCost, notes, startDate, expectedEndDate } = req.body;
    if (!patientId || !procedureName) return res.status(400).json({ error: 'patientId and procedureName required' });

    const { data, error } = await supabase.from('treatment_plans').insert({
      patient_id: patientId,
      dentist_id: req.dentistId,
      diagnosis: diagnosis || null,
      procedure_name: procedureName,
      total_sittings: totalSittings || 1,
      completed_sittings: 0,
      estimated_cost: estimatedCost ? parseFloat(estimatedCost) : 0,
      collected_amount: 0,
      notes: notes || null,
      start_date: startDate || new Date().toISOString().split('T')[0],
      expected_end_date: expectedEndDate || null,
    }).select().single();

    if (error) throw error;
    res.status(201).json({ plan: data });
  } catch (err) { next(err); }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('treatment_plans')
      .select(`*, visits(id, visit_date, sitting_number, status, procedure_name, cost), appointments(id, appointment_date, appointment_time, sitting_number, status, purpose)`)
      .eq('id', req.params.id)
      .eq('dentist_id', req.dentistId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Plan not found' });
    res.json({ plan: data });
  } catch (err) { next(err); }
});

router.patch('/:id', auth, async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.completedSittings !== undefined) updates.completed_sittings = req.body.completedSittings;
    if (req.body.collectedAmount !== undefined) updates.collected_amount = parseFloat(req.body.collectedAmount);
    if (req.body.status) updates.status = req.body.status;
    if (req.body.estimatedCost !== undefined) updates.estimated_cost = parseFloat(req.body.estimatedCost);
    if (req.body.notes) updates.notes = req.body.notes;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from('treatment_plans')
      .update(updates)
      .eq('id', req.params.id)
      .eq('dentist_id', req.dentistId)
      .select().single();

    if (error) throw error;
    res.json({ plan: data });
  } catch (err) { next(err); }
});

module.exports = router;
