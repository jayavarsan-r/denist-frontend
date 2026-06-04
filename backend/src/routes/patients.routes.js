const router = require('express').Router();
const ctrl = require('../controllers/patients.controller');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const supabase = require('../config/supabase');
const { createSchema, updateSchema } = require('../validators/patient.validator');
const { ok, fail } = require('../utils/response');

router.use(auth);
router.get('/', ctrl.list);
router.post('/', validate(createSchema), ctrl.create);

// Tooth history — must come before /:id to avoid conflict
router.get('/:id/tooth-history', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: visits, error } = await supabase
      .from('visits').select('*')
      .eq('patient_id', id).eq('dentist_id', req.dentistId)
      .order('visit_date', { ascending: false });
    if (error) throw error;

    const { data: appointments } = await supabase
      .from('appointments').select('*')
      .eq('patient_id', id).eq('dentist_id', req.dentistId)
      .gte('appointment_date', new Date().toISOString().split('T')[0])
      .neq('status', 'cancelled').order('appointment_date');

    const toothVisits = (visits || []).filter(v => v.tooth_number);
    const generalVisits = (visits || []).filter(v => !v.tooth_number);
    const toothMap = new Map();
    toothVisits.forEach(v => {
      const tn = v.tooth_number;
      if (!toothMap.has(tn)) {
        toothMap.set(tn, { toothNumber: tn, completedProcedures: [], upcomingAppointments: [], totalCost: 0, lastProcedureDate: null, overallStatus: 'treated' });
      }
      const entry = toothMap.get(tn);
      entry.completedProcedures.push({ visitId: v.id, date: v.visit_date, procedure: v.procedure_name, status: v.status, notes: v.notes, cost: v.cost != null ? parseFloat(v.cost) : null, followUpDate: v.follow_up_date });
      if (v.cost != null) entry.totalCost += parseFloat(v.cost);
      if (!entry.lastProcedureDate || v.visit_date > entry.lastProcedureDate) entry.lastProcedureDate = v.visit_date;
    });
    (appointments || []).forEach(a => {
      if (a.tooth_number && toothMap.has(a.tooth_number)) {
        toothMap.get(a.tooth_number).upcomingAppointments.push({ appointmentId: a.id, date: a.appointment_date, time: a.appointment_time, purpose: a.purpose, status: a.status });
      }
    });
    toothMap.forEach(entry => {
      const hasPending = entry.upcomingAppointments.length > 0;
      const hasCompleted = entry.completedProcedures.length > 0;
      entry.overallStatus = hasCompleted && hasPending ? 'treated_pending' : hasPending ? 'pending' : 'treated';
    });
    const totalBilled = Array.from(toothMap.values()).reduce((s, t) => s + t.totalCost, 0)
      + (visits || []).reduce((s, v) => s + (v.tooth_number ? 0 : (v.cost != null ? parseFloat(v.cost) : 0)), 0);

    return ok(res, { patientId: id, toothMap: Array.from(toothMap.values()), generalVisits, totalBilled });
  } catch (e) { next(e); }
});

router.get('/:id', ctrl.getById);
router.put('/:id', validate(updateSchema), ctrl.update);
router.delete('/:id', ctrl.remove);

router.get('/:id/treatment-plans', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('treatment_plans').select('*')
      .eq('patient_id', req.params.id).eq('dentist_id', req.dentistId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ok(res, { plans: data || [] });
  } catch (e) { next(e); }
});

router.get('/:id/prescriptions', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('prescriptions').select('*')
      .eq('patient_id', req.params.id).eq('dentist_id', req.dentistId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ok(res, { prescriptions: data || [] });
  } catch (e) { next(e); }
});

router.get('/:id/xrays', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('xrays').select('*')
      .eq('patient_id', req.params.id).eq('dentist_id', req.dentistId)
      .order('date_taken', { ascending: false });
    if (error) throw error;
    return ok(res, { xrays: data || [] });
  } catch (e) { next(e); }
});

router.get('/:id/case-sheet', async (req, res, next) => {
  try {
    const patientId = req.params.id;
    const today = new Date().toISOString().split('T')[0];
    const [patientRes, plansRes, visitsRes, prescRes, xraysRes, apptRes] = await Promise.all([
      supabase.from('patients').select('*').eq('id', patientId).eq('dentist_id', req.dentistId).single(),
      supabase.from('treatment_plans').select('*').eq('patient_id', patientId).eq('dentist_id', req.dentistId).order('created_at', { ascending: false }),
      supabase.from('visits').select('id, visit_date, procedure_name, status, notes, medications, cost, tooth_number, follow_up_date').eq('patient_id', patientId).eq('dentist_id', req.dentistId).order('visit_date', { ascending: false }),
      supabase.from('prescriptions').select('id, created_at, instructions, follow_up, medicines').eq('patient_id', patientId).eq('dentist_id', req.dentistId).order('created_at', { ascending: false }),
      supabase.from('xrays').select('id, xray_type, date_taken, tooth_number, notes').eq('patient_id', patientId).eq('dentist_id', req.dentistId).order('date_taken', { ascending: false }),
      supabase.from('appointments').select('*').eq('patient_id', patientId).eq('dentist_id', req.dentistId).gte('appointment_date', today).eq('status', 'scheduled').order('appointment_date', { ascending: true }).limit(3),
    ]);

    if (patientRes.error || !patientRes.data) return fail(res, 404, 'NOT_FOUND', 'Patient not found');

    const activePlans = (plansRes.data || []).filter(p => p.status === 'active');
    const totalBilled = (visitsRes.data || []).reduce((s, v) => s + (parseFloat(v.cost) || 0), 0);
    const totalPlannedCost = (plansRes.data || []).reduce((s, p) => s + (parseFloat(p.estimated_cost) || 0), 0);
    const totalCollected = (plansRes.data || []).reduce((s, p) => s + (parseFloat(p.collected_amount) || 0), 0);

    return ok(res, {
      patient: patientRes.data,
      activeTreatmentPlans: activePlans,
      allTreatmentPlans: plansRes.data || [],
      visits: visitsRes.data || [],
      prescriptions: prescRes.data || [],
      xrays: xraysRes.data || [],
      upcomingAppointments: apptRes.data || [],
      summary: { totalVisits: (visitsRes.data || []).length, totalBilled, totalPlannedCost, totalCollected, pendingAmount: totalPlannedCost - totalCollected, totalXrays: (xraysRes.data || []).length, totalPrescriptions: (prescRes.data || []).length },
    });
  } catch (e) { next(e); }
});

module.exports = router;
