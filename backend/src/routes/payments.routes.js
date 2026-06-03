const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');

// POST /api/payments — record a payment
router.post('/', auth, async (req, res, next) => {
  try {
    const { patientId, treatmentPlanId, queueEntryId, amount, paymentMethod, notes, paymentDate } = req.body;
    if (!patientId || !amount) return res.status(400).json({ error: 'patientId and amount required' });

    const { data, error } = await supabase.from('payments').insert({
      clinic_id:         req.clinicId,
      patient_id:        patientId,
      treatment_plan_id: treatmentPlanId || null,
      queue_entry_id:    queueEntryId || null,
      received_by:       req.staffId || null,
      amount:            parseFloat(amount),
      payment_method:    paymentMethod || 'cash',
      notes:             notes || null,
      payment_date:      paymentDate || new Date().toISOString().split('T')[0],
    }).select().single();

    if (error) throw error;

    // Sync collected_amount and pending_amount on treatment plan
    if (treatmentPlanId) {
      const { data: plan } = await supabase.from('treatment_plans')
        .select('collected_amount, estimated_cost').eq('id', treatmentPlanId).single();
      if (plan) {
        const newCollected = parseFloat(plan.collected_amount || 0) + parseFloat(amount);
        const newPending = Math.max(0, parseFloat(plan.estimated_cost || 0) - newCollected);
        await supabase.from('treatment_plans')
          .update({ collected_amount: newCollected, pending_amount: newPending })
          .eq('id', treatmentPlanId);
      }
    }

    res.status(201).json({ payment: data });
  } catch (e) { next(e); }
});

// GET /api/payments/patient/:patientId
router.get('/patient/:patientId', auth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(`*, received_by_staff:received_by(name, role), treatment_plans(procedure_name)`)
      .eq('patient_id', req.params.patientId)
      .eq('clinic_id', req.clinicId)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    const total = (data || []).reduce((s, p) => s + parseFloat(p.amount), 0);
    res.json({ payments: data || [], total });
  } catch (e) { next(e); }
});

// GET /api/payments/plan/:planId
router.get('/plan/:planId', auth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(`*, received_by_staff:received_by(name, role)`)
      .eq('treatment_plan_id', req.params.planId)
      .eq('clinic_id', req.clinicId)
      .order('payment_date', { ascending: false });

    if (error) throw error;
    const total = (data || []).reduce((s, p) => s + parseFloat(p.amount), 0);
    res.json({ payments: data || [], total });
  } catch (e) { next(e); }
});

module.exports = router;
