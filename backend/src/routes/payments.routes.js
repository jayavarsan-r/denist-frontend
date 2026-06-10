const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
<<<<<<< HEAD
const validate = require('../middleware/validate');
const v = require('../validators');
const transaction = require('../services/transaction.service');
const { parsePagination, pageMeta } = require('../utils/pagination');
=======
const { ok, okCreated, fail } = require('../utils/response');
>>>>>>> origin/main

// POST /api/payments — record a payment (transaction service: insert + plan sync + audit)
router.post('/', auth, validate(v.recordPayment), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, treatmentPlanId, queueEntryId, amount, paymentMethod, notes, paymentDate } = req.body;
<<<<<<< HEAD
    const payment = await transaction.recordPayment({
      clinicId: req.clinicId, staffId: req.staffId, requestId: req.id,
      patientId, treatmentPlanId, queueEntryId, amount, paymentMethod, notes, paymentDate,
    });
    res.status(201).json({ payment });
  } catch (e) { next(e); }
});
=======
    if (!patientId || !amount) return fail(res, 400, 'VALIDATION_ERROR', 'patientId and amount required');

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
>>>>>>> origin/main

// GET /api/payments — clinic-wide payments list (paginated, optional date range)
router.get('/', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { from, to, page, limit } = parsePagination(req.query);
    let q = supabase.from('payments')
      .select('*, received_by_staff:received_by(name, role), patients(name), treatment_plans(procedure_name)', { count: 'exact' })
      .eq('clinic_id', req.clinicId);
    if (req.query.fromDate) q = q.gte('payment_date', req.query.fromDate);
    if (req.query.toDate) q = q.lte('payment_date', req.query.toDate);
    q = q.order('payment_date', { ascending: false }).order('created_at', { ascending: false }).range(from, to);
    const { data, error, count } = await q;
    if (error) throw error;
<<<<<<< HEAD
    res.json({ payments: data || [], pagination: pageMeta({ page, limit }, count) });
=======

    // Update collected_amount on treatment plan — pending_amount is a generated column
    // (Postgres recomputes it automatically as estimated_cost - collected_amount)
    if (treatmentPlanId) {
      const { data: plan } = await supabase.from('treatment_plans')
        .select('collected_amount').eq('id', treatmentPlanId).single();
      if (plan) {
        const newCollected = parseFloat(plan.collected_amount || 0) + parseFloat(amount);
        await supabase.from('treatment_plans')
          .update({ collected_amount: newCollected })
          .eq('id', treatmentPlanId);
      }
    }

    return okCreated(res, { payment: data });
>>>>>>> origin/main
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
    return ok(res, { payments: data || [], total });
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
    return ok(res, { payments: data || [], total });
  } catch (e) { next(e); }
});

module.exports = router;
