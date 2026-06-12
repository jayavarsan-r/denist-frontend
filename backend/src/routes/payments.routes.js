const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const transaction = require('../services/transaction.service');
const { parsePagination, pageMeta } = require('../utils/pagination');

// POST /api/payments — record a payment (transaction service: insert + plan sync + audit)
router.post('/', auth, validate(v.recordPayment), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, treatmentPlanId, queueEntryId, amount, paymentMethod, notes, paymentDate } = req.body;
    const payment = await transaction.recordPayment({
      clinicId: req.clinicId, staffId: req.staffId, requestId: req.id,
      patientId, treatmentPlanId, queueEntryId, amount, paymentMethod, notes, paymentDate,
    });
    res.status(201).json({ payment });
  } catch (e) { next(e); }
});

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
    res.json({ payments: data || [], pagination: pageMeta({ page, limit }, count) });
  } catch (e) { next(e); }
});

// GET /api/payments/stats — clinic-wide collection totals for the finance screen:
// today, this calendar month, and all time.
router.get('/stats', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 8) + '01';
    const sum = (rows) => (rows || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const [{ data: all, error }, { data: month }, { data: day }] = await Promise.all([
      supabase.from('payments').select('amount').eq('clinic_id', req.clinicId),
      supabase.from('payments').select('amount').eq('clinic_id', req.clinicId).gte('payment_date', monthStart),
      supabase.from('payments').select('amount').eq('clinic_id', req.clinicId).eq('payment_date', today),
    ]);
    if (error) throw error;
    res.json({ today: sum(day), month: sum(month), total: sum(all) });
  } catch (e) { next(e); }
});

// GET /api/payments/patient/:patientId
router.get('/patient/:patientId', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
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
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
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
