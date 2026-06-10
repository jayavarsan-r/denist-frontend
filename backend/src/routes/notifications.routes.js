const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const { notify } = require('../services/notifications/notifications.service');
const msg = require('../services/notifications/messages');
const { parsePagination, pageMeta } = require('../utils/pagination');
const { outstandingFor } = require('../utils/payment-math');

const ctx = (req) => ({ clinicId: req.clinicId, staffId: req.staffId });

// POST /api/notifications — generic
router.post('/', auth, validate(v.sendNotification), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, type, channel, body, payload } = req.body;
    let recipient = null;
    if (patientId) {
      const { data: p } = await supabase.from('patients').select('phone').eq('id', patientId).eq('clinic_id', req.clinicId).maybeSingle();
      recipient = p?.phone || null;
    }
    const notification = await notify({ ...ctx(req), patientId, type, channel, recipient, body: body || '', payload: payload || {} });
    res.status(201).json({ notification });
  } catch (e) { next(e); }
});

// POST /api/notifications/prescription/:prescriptionId
router.post('/prescription/:prescriptionId', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { data: rx } = await supabase.from('prescriptions')
      .select('*, patients(name, phone)').eq('id', req.params.prescriptionId)
      .or(`clinic_id.eq.${req.clinicId},dentist_id.eq.${req.dentistId}`).maybeSingle();
    if (!rx) return res.status(404).json({ error: 'Prescription not found' });
    const body = msg.buildPrescriptionMessage(rx.patients, rx.medicines || []);
    const notification = await notify({ ...ctx(req), patientId: rx.patient_id, type: 'prescription',
      recipient: rx.patients?.phone || null, body, payload: { prescriptionId: rx.id } });
    res.status(201).json({ notification });
  } catch (e) { next(e); }
});

// POST /api/notifications/reminder
router.post('/reminder', auth, validate(v.notifyReminder), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { data: appt } = await supabase.from('appointments')
      .select('*, patients(name, phone)').eq('id', req.body.appointmentId).eq('clinic_id', req.clinicId).maybeSingle();
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    const body = msg.buildReminderMessage(appt.patients, appt);
    const notification = await notify({ ...ctx(req), patientId: appt.patient_id, type: 'appointment_reminder',
      recipient: appt.patients?.phone || null, body, payload: { appointmentId: appt.id } });
    res.status(201).json({ notification });
  } catch (e) { next(e); }
});

// POST /api/notifications/payment-due
router.post('/payment-due', auth, validate(v.notifyPaymentDue), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, treatmentPlanId } = req.body;
    const { data: p } = await supabase.from('patients').select('name, phone').eq('id', patientId).eq('clinic_id', req.clinicId).maybeSingle();
    let amount = 0;
    if (treatmentPlanId) {
      const { data: plan } = await supabase.from('treatment_plans').select('estimated_cost, collected_amount').eq('id', treatmentPlanId).eq('clinic_id', req.clinicId).maybeSingle();
      if (plan) amount = outstandingFor(plan);
    } else {
      const { data: plans } = await supabase.from('treatment_plans').select('estimated_cost, collected_amount').eq('patient_id', patientId).eq('status', 'active');
      amount = (plans || []).reduce((s, pl) => s + outstandingFor(pl), 0);
    }
    const body = msg.buildPaymentDueMessage(p, amount);
    const notification = await notify({ ...ctx(req), patientId, type: 'payment_due', recipient: p?.phone || null, body, payload: { amount } });
    res.status(201).json({ notification });
  } catch (e) { next(e); }
});

// POST /api/notifications/recall
router.post('/recall', auth, validate(v.notifyRecall), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, dueDate, reason } = req.body;
    const { data: p } = await supabase.from('patients').select('name, phone').eq('id', patientId).eq('clinic_id', req.clinicId).maybeSingle();
    const body = msg.buildRecallMessage(p, dueDate, reason);
    const notification = await notify({ ...ctx(req), patientId, type: 'recall', recipient: p?.phone || null, body, payload: { dueDate, reason } });
    res.status(201).json({ notification });
  } catch (e) { next(e); }
});

// GET /api/notifications — clinic log feed (paginated)
router.get('/', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { from, to, page, limit } = parsePagination(req.query);
    const { data, error, count } = await supabase.from('notification_logs')
      .select('*', { count: 'exact' }).eq('clinic_id', req.clinicId)
      .order('created_at', { ascending: false }).range(from, to);
    if (error) throw error;
    res.json({ notifications: data || [], pagination: pageMeta({ page, limit }, count) });
  } catch (e) { next(e); }
});

module.exports = router;
