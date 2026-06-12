const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const { installmentsFor, advanceDueDate, buildSchedule } = require('../utils/emi');

// POST /api/payment-plans — create an EMI schedule
router.post('/', auth, validate(v.createPaymentPlan), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, treatmentPlanId, totalAmount, advancePaid, emiAmount, emiFrequency, startDate, notes } = req.body;
    const freq = emiFrequency || 'monthly';
    const start = startDate || new Date().toISOString().slice(0, 10);
    const installments = installmentsFor(totalAmount, advancePaid || 0, emiAmount);
    const nextDue = installments > 0 ? advanceDueDate(start, freq) : null;
    const { data, error } = await supabase.from('payment_plans').insert({
      clinic_id: req.clinicId, patient_id: patientId, treatment_plan_id: treatmentPlanId || null,
      total_amount: totalAmount, advance_paid: advancePaid || 0, emi_amount: emiAmount,
      emi_frequency: freq, installments_total: installments, next_due_date: nextDue,
      status: 'active', notes: notes || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ plan: data });
  } catch (e) { next(e); }
});

// GET /api/payment-plans/patient/:patientId
router.get('/patient/:patientId', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { data, error } = await supabase.from('payment_plans')
      .select('*').eq('patient_id', req.params.patientId).eq('clinic_id', req.clinicId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ plans: data || [] });
  } catch (e) { next(e); }
});

// GET /api/payment-plans/:id — plan + derived schedule + paid/remaining
router.get('/:id', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { data: plan, error } = await supabase.from('payment_plans')
      .select('*').eq('id', req.params.id).eq('clinic_id', req.clinicId).maybeSingle();
    if (error) throw error;
    if (!plan) return res.status(404).json({ error: 'Payment plan not found' });

    let paid = parseFloat(plan.advance_paid || 0);
    if (plan.treatment_plan_id) {
      const { data: pays, error: payErr } = await supabase.from('payments')
        .select('amount').eq('treatment_plan_id', plan.treatment_plan_id).eq('clinic_id', req.clinicId);
      if (payErr) throw payErr;
      paid += (pays || []).reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    }
    const schedule = buildSchedule(plan.created_at.slice(0, 10), plan.emi_frequency, plan.installments_total, plan.emi_amount);
    res.json({ plan, paid, remaining: Math.max(0, parseFloat(plan.total_amount || 0) - paid), schedule });
  } catch (e) { next(e); }
});

// PATCH /api/payment-plans/:id
router.patch('/:id', auth, validate(v.updatePaymentPlan), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const map = { emiAmount: 'emi_amount', emiFrequency: 'emi_frequency', nextDueDate: 'next_due_date', status: 'status', notes: 'notes' };
    const updates = { updated_at: new Date().toISOString() };
    for (const [k, col] of Object.entries(map)) if (req.body[k] !== undefined) updates[col] = req.body[k];
    const { data, error } = await supabase.from('payment_plans')
      .update(updates).eq('id', req.params.id).eq('clinic_id', req.clinicId).select().single();
    if (error) throw error;
    res.json({ plan: data });
  } catch (e) { next(e); }
});

module.exports = router;
