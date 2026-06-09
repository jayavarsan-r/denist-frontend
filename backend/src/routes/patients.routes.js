const router = require('express').Router();
const ctrl = require('../controllers/patients.controller');
const auth = require('../middleware/auth');
const supabase = require('../config/supabase');
const validate = require('../middleware/validate');
const v = require('../validators');

router.use(auth);
router.get('/', ctrl.list);
router.post('/', validate(v.createPatient), ctrl.create);

// Tooth history — must come before /:id to avoid conflict
router.get('/:id/tooth-history', async (req, res, next) => {
  try {
    const { id } = req.params;
    const today = new Date().toISOString().split('T')[0];
    // Each source is independent and non-fatal: a missing table (e.g. treatment_teeth
    // before migration 007) must not break the whole history view.
    const safe = async (p) => { try { const { data } = await p; return data || []; } catch { return []; } };

    const [visits, appointments, links, labOrders, plans, payments] = await Promise.all([
      safe(supabase.from('visits').select('*').eq('patient_id', id).eq('dentist_id', req.dentistId).order('visit_date', { ascending: false })),
      safe(supabase.from('appointments').select('*').eq('patient_id', id).eq('dentist_id', req.dentistId).gte('appointment_date', today).neq('status', 'cancelled').order('appointment_date')),
      safe(supabase.from('treatment_teeth').select('*').eq('patient_id', id)),
      safe(supabase.from('lab_orders').select('*').eq('patient_id', id).eq('dentist_id', req.dentistId).is('deleted_at', null).order('created_at', { ascending: false })),
      safe(supabase.from('treatment_plans').select('*').eq('patient_id', id).eq('dentist_id', req.dentistId).order('created_at', { ascending: false })),
      safe(supabase.from('payments').select('*').eq('patient_id', id).order('payment_date', { ascending: false })),
    ]);

    // teeth covered per visit / per plan (multi-tooth link table)
    const visitTeeth = new Map();
    const planTeeth = new Map();
    links.forEach(l => {
      if (l.visit_id) { if (!visitTeeth.has(l.visit_id)) visitTeeth.set(l.visit_id, new Set()); visitTeeth.get(l.visit_id).add(l.tooth_number); }
      if (l.treatment_plan_id) { if (!planTeeth.has(l.treatment_plan_id)) planTeeth.set(l.treatment_plan_id, new Set()); planTeeth.get(l.treatment_plan_id).add(l.tooth_number); }
    });

    const toothMap = new Map();
    const ensure = (tn) => {
      if (!toothMap.has(tn)) toothMap.set(tn, {
        toothNumber: tn, completedProcedures: [], upcomingAppointments: [], labOrders: [],
        totalCost: 0, lastProcedureDate: null, overallStatus: 'treated',
      });
      return toothMap.get(tn);
    };

    // Build per-tooth completed procedures. A procedure's tooth set = visit.tooth_number
    // unioned with its treatment_teeth links, so each entry carries ALL teeth covered.
    visits.forEach(v => {
      const teeth = new Set(visitTeeth.get(v.id) || []);
      if (v.tooth_number) teeth.add(v.tooth_number);
      if (teeth.size === 0) return;
      const teethArr = [...teeth];
      teethArr.forEach(tn => {
        const entry = ensure(tn);
        entry.completedProcedures.push({
          visitId: v.id, date: v.visit_date, procedure: v.procedure_name, status: v.status,
          notes: v.notes, cost: v.cost != null ? parseFloat(v.cost) : null,
          followUpDate: v.follow_up_date, teeth: teethArr,
        });
        if (v.cost != null) entry.totalCost += parseFloat(v.cost);
        if (!entry.lastProcedureDate || v.visit_date > entry.lastProcedureDate) entry.lastProcedureDate = v.visit_date;
      });
    });

    const generalVisits = visits.filter(v => !v.tooth_number && !(visitTeeth.get(v.id) && visitTeeth.get(v.id).size));

    appointments.forEach(a => {
      if (!a.tooth_number) return;
      ensure(a.tooth_number).upcomingAppointments.push({
        appointmentId: a.id, date: a.appointment_date, time: a.appointment_time, purpose: a.purpose, status: a.status,
      });
    });

    labOrders.forEach(lo => {
      if (!lo.tooth_number) return;
      ensure(lo.tooth_number).labOrders.push({
        id: lo.id, labName: lo.lab_name, procedureType: lo.procedure_type, status: lo.status,
        sentDate: lo.sent_date, expectedReturnDate: lo.expected_return_date, shade: lo.shade,
        workDescription: lo.work_description,
        chargedToPatient: lo.charged_to_patient != null ? parseFloat(lo.charged_to_patient) : null,
      });
    });

    toothMap.forEach(entry => {
      const hasCompleted = entry.completedProcedures.length > 0;
      const hasPending = entry.upcomingAppointments.length > 0;
      entry.overallStatus = hasCompleted && hasPending ? 'treated_pending' : hasPending ? 'pending' : 'treated';
    });

    const totalBilled = visits.reduce((s, v) => s + (v.cost != null ? parseFloat(v.cost) : 0), 0);
    const totalCollected = payments.reduce((s, p) => s + (p.amount != null ? parseFloat(p.amount) : 0), 0);
    const totalPlanned = plans.reduce((s, p) => s + (p.estimated_cost != null ? parseFloat(p.estimated_cost) : 0), 0);

    res.json({
      patientId: id,
      toothMap: Array.from(toothMap.values()),
      generalVisits,
      totalBilled, // back-compat (also in summary.totalBilled)
      treatmentPlans: plans.map(p => ({
        id: p.id, procedure: p.procedure_name, diagnosis: p.diagnosis, status: p.status,
        totalSittings: p.total_sittings, completedSittings: p.completed_sittings,
        estimatedCost: p.estimated_cost != null ? parseFloat(p.estimated_cost) : 0,
        collectedAmount: p.collected_amount != null ? parseFloat(p.collected_amount) : 0,
        pendingAmount: p.pending_amount != null ? parseFloat(p.pending_amount) : null,
        teeth: [...(planTeeth.get(p.id) || [])], startDate: p.start_date, createdAt: p.created_at,
      })),
      payments: payments.map(p => ({
        id: p.id, amount: p.amount != null ? parseFloat(p.amount) : 0, date: p.payment_date,
        method: p.payment_method, treatmentPlanId: p.treatment_plan_id, notes: p.notes,
      })),
      labOrders: labOrders.map(lo => ({
        id: lo.id, toothNumber: lo.tooth_number, labName: lo.lab_name, procedureType: lo.procedure_type,
        status: lo.status, sentDate: lo.sent_date, expectedReturnDate: lo.expected_return_date,
        chargedToPatient: lo.charged_to_patient != null ? parseFloat(lo.charged_to_patient) : null,
      })),
      summary: { totalBilled, totalCollected, totalPlanned, pendingAmount: Math.max(0, totalPlanned - totalCollected) },
    });
  } catch (e) { next(e); }
});

router.get('/:id', ctrl.getById);
router.put('/:id', validate(v.updatePatient), ctrl.update);
router.delete('/:id', ctrl.remove);

// ─── NEW V4 SUB-ROUTES ───

router.get('/:id/treatment-plans', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('treatment_plans').select('*')
      .eq('patient_id', req.params.id).eq('dentist_id', req.dentistId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ plans: data || [] });
  } catch (e) { next(e); }
});

router.get('/:id/prescriptions', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('prescriptions').select('*')
      .eq('patient_id', req.params.id).eq('dentist_id', req.dentistId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ prescriptions: data || [] });
  } catch (e) { next(e); }
});

router.get('/:id/lab-orders', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('lab_orders').select('*')
      .eq('patient_id', req.params.id).eq('dentist_id', req.dentistId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ labOrders: data || [] });
  } catch (e) { next(e); }
});

router.get('/:id/xrays', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('xrays').select('*')
      .eq('patient_id', req.params.id).eq('dentist_id', req.dentistId)
      .order('date_taken', { ascending: false });
    if (error) throw error;
    res.json({ xrays: data || [] });
  } catch (e) { next(e); }
});

router.get('/:id/case-sheet', async (req, res, next) => {
  try {
    const patientId = req.params.id;
    const today = new Date().toISOString().split('T')[0];

    // lab_orders may not exist before migration 007 — keep it non-fatal.
    const safeLab = supabase.from('lab_orders').select('*').eq('patient_id', patientId).eq('dentist_id', req.dentistId).is('deleted_at', null).order('created_at', { ascending: false })
      .then(r => r.data || []).catch(() => []);

    const [patientRes, plansRes, visitsRes, prescRes, xraysRes, apptRes, labOrders] = await Promise.all([
      supabase.from('patients').select('*').eq('id', patientId).eq('dentist_id', req.dentistId).single(),
      supabase.from('treatment_plans').select('*').eq('patient_id', patientId).eq('dentist_id', req.dentistId).order('created_at', { ascending: false }),
      supabase.from('visits').select(`*, visit_notes(*)`).eq('patient_id', patientId).eq('dentist_id', req.dentistId).order('visit_date', { ascending: false }),
      supabase.from('prescriptions').select('*').eq('patient_id', patientId).eq('dentist_id', req.dentistId).order('created_at', { ascending: false }),
      supabase.from('xrays').select('id, xray_type, date_taken, tooth_number, notes, storage_path').eq('patient_id', patientId).eq('dentist_id', req.dentistId).order('date_taken', { ascending: false }),
      supabase.from('appointments').select('*').eq('patient_id', patientId).eq('dentist_id', req.dentistId).gte('appointment_date', today).eq('status', 'scheduled').order('appointment_date', { ascending: true }).limit(3),
      safeLab,
    ]);

    if (patientRes.error || !patientRes.data) return res.status(404).json({ error: 'Patient not found' });

    const totalBilled = (visitsRes.data || []).reduce((s, v) => s + (parseFloat(v.cost) || 0), 0);
    const totalPlannedCost = (plansRes.data || []).reduce((s, p) => s + (parseFloat(p.estimated_cost) || 0), 0);
    const totalCollected = (plansRes.data || []).reduce((s, p) => s + (parseFloat(p.collected_amount) || 0), 0);
    const activePlans = (plansRes.data || []).filter(p => p.status === 'active');

    res.json({
      patient: patientRes.data,
      activeTreatmentPlans: activePlans,
      allTreatmentPlans: plansRes.data || [],
      visits: visitsRes.data || [],
      prescriptions: prescRes.data || [],
      xrays: xraysRes.data || [],
      labOrders: labOrders || [],
      upcomingAppointments: apptRes.data || [],
      summary: {
        totalVisits: (visitsRes.data || []).length,
        totalBilled,
        totalPlannedCost,
        totalCollected,
        pendingAmount: totalPlannedCost - totalCollected,
        totalXrays: (xraysRes.data || []).length,
        totalPrescriptions: (prescRes.data || []).length,
      },
    });
  } catch (e) { next(e); }
});

module.exports = router;
