const router = require('express').Router();
const ctrl = require('../controllers/patients.controller');
const auth = require('../middleware/auth');
const supabase = require('../config/supabase');
const validate = require('../middleware/validate');
const v = require('../validators');
const { getSignedUrl } = require('../services/storage.service');
const { generateCaseSheetPdf, generateStatementPdf } = require('../services/pdf');
const { loadBrandingContext } = require('../services/pdf/branding.data');

// A patient is clinic-scoped, so anyone who can see the patient can see their data.
// Returns the patient row if the caller's clinic owns it, else null. clinic_id is the
// tenancy boundary: with clinic context ONLY a clinic match grants access (a dentist's
// rows at a previous clinic must not follow them). dentist_id matching applies only to
// pre-clinic accounts that have no clinic context at all.
async function patientInScope(patientId, req) {
  const { data } = await supabase.from('patients')
    .select('id, clinic_id, dentist_id').eq('id', patientId).maybeSingle();
  if (!data) return null;
  if (req.clinicId) return data.clinic_id === req.clinicId ? data : null;
  if (data.dentist_id === req.dentistId) return data;
  return null;
}

// Clinic-scoped query helper used by every patient sub-route: a patient's records
// belong to the clinic, visible to ALL its staff. Strict clinic_id when clinic context
// exists; dentist_id only for pre-clinic accounts (see patientInScope).
function scoped(q, req) {
  return req.clinicId ? q.eq('clinic_id', req.clinicId) : q.eq('dentist_id', req.dentistId);
}

router.use(auth);
router.get('/', ctrl.list);
router.post('/', validate(v.createPatient), ctrl.create);

// Tooth history — must come before /:id to avoid conflict
router.get('/:id/tooth-history', async (req, res, next) => {
  try {
    const { id } = req.params;
    // Ownership gate up front: some sub-queries below (payments, treatment_teeth) are
    // keyed on patient_id alone, so the patient must be proven in-clinic first.
    if (!(await patientInScope(id, req))) return res.status(404).json({ error: 'Patient not found' });
    const today = new Date().toISOString().split('T')[0];
    // Each source is independent and non-fatal: a missing table (e.g. treatment_teeth
    // before migration 007) must not break the whole history view.
    const safe = async (p) => { try { const { data } = await p; return data || []; } catch { return []; } };
    // Clinic-scoped so a patient's full history is visible to every staff member in the
    // clinic (doctor + receptionist), not just the dentist_id that created each row.
    const scope = (q) => scoped(q, req);

    const [visits, appointments, links, labOrders, plans, payments] = await Promise.all([
      safe(scope(supabase.from('visits').select('*').eq('patient_id', id)).order('visit_date', { ascending: false })),
      safe(scope(supabase.from('appointments').select('*').eq('patient_id', id)).gte('appointment_date', today).neq('status', 'cancelled').order('appointment_date')),
      safe(supabase.from('treatment_teeth').select('*').eq('patient_id', id)),
      safe(scope(supabase.from('lab_orders').select('*').eq('patient_id', id)).is('deleted_at', null).order('created_at', { ascending: false })),
      safe(scope(supabase.from('treatment_plans').select('*').eq('patient_id', id)).order('created_at', { ascending: false })),
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

    // Merge current per-tooth status from tooth_chart (additive; never overwrites history).
    // tooth_chart is purely clinic-scoped (no dentist_id), so it's keyed on clinic_id/patient_id
    // only; skip for legacy dentist-only callers (no clinicId) so we never send clinic_id=undefined.
    if (req.clinicId) {
      const { data: chartRows } = await supabase.from('tooth_chart')
        .select('tooth_number, conditions').eq('clinic_id', req.clinicId).eq('patient_id', id);
      const chartByTooth = new Map((chartRows || []).map(r => [r.tooth_number, r.conditions || []]));
      toothMap.forEach((entry, tn) => { entry.currentConditions = chartByTooth.get(tn) || []; });
    } else {
      toothMap.forEach((entry) => { entry.currentConditions = []; });
    }

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

// GET /api/patients/:id/tooth-chart — current per-tooth status
router.get('/:id/tooth-chart', async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { data, error } = await supabase.from('tooth_chart')
      .select('tooth_number, conditions, surfaces, notes, updated_at')
      .eq('clinic_id', req.clinicId).eq('patient_id', req.params.id);
    if (error) throw error;
    res.json({ chart: (data || []).map(r => ({
      toothNumber: r.tooth_number, conditions: r.conditions || [], surfaces: r.surfaces || null,
      notes: r.notes || '', updatedAt: r.updated_at,
    })) });
  } catch (e) { next(e); }
});

// PUT /api/patients/:id/tooth-chart/:toothNumber — upsert status for one tooth
router.put('/:id/tooth-chart/:toothNumber', validate(v.toothChartUpsert), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { conditions, surfaces, notes } = req.body;
    const { data, error } = await supabase.from('tooth_chart').upsert({
      clinic_id: req.clinicId, patient_id: req.params.id, tooth_number: req.params.toothNumber,
      conditions, surfaces: surfaces || null, notes: notes || null,
      updated_by: req.staffId || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'clinic_id,patient_id,tooth_number' }).select().single();
    if (error) throw error;
    res.json({ tooth: { toothNumber: data.tooth_number, conditions: data.conditions, surfaces: data.surfaces, notes: data.notes } });
  } catch (e) { next(e); }
});

// Profile consult (no queue entry): async voice pipeline keyed on the patient.
const voice = require('../controllers/voice.controller');
router.post('/:id/start-voice', voice.uploadMiddleware, voice.startVoiceForPatient);

router.get('/:id', ctrl.getById);
router.put('/:id', validate(v.updatePatient), ctrl.update);
router.delete('/:id', ctrl.remove);

// ─── NEW V4 SUB-ROUTES ───

router.get('/:id/treatment-plans', async (req, res, next) => {
  try {
    const { data, error } = await scoped(supabase.from('treatment_plans').select('*')
      .eq('patient_id', req.params.id), req)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ plans: data || [] });
  } catch (e) { next(e); }
});

router.get('/:id/prescriptions', async (req, res, next) => {
  try {
    const { data, error } = await scoped(supabase.from('prescriptions').select('*')
      .eq('patient_id', req.params.id), req)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ prescriptions: data || [] });
  } catch (e) { next(e); }
});

router.get('/:id/lab-orders', async (req, res, next) => {
  try {
    const { data, error } = await scoped(supabase.from('lab_orders').select('*')
      .eq('patient_id', req.params.id), req)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ labOrders: data || [] });
  } catch (e) { next(e); }
});

router.get('/:id/xrays', async (req, res, next) => {
  try {
    // Show ALL of this patient's x-rays regardless of which staff (doctor/receptionist)
    // uploaded them — the patient is clinic-scoped, so uploader identity must not gate
    // visibility. Previously this filtered by dentist_id, hiding receptionist uploads
    // from the doctor.
    if (!(await patientInScope(req.params.id, req))) {
      return res.status(404).json({ error: 'Patient not found' });
    }
    const { data, error } = await supabase.from('xrays').select('*')
      .eq('patient_id', req.params.id)
      .is('deleted_at', null)
      .order('date_taken', { ascending: false });
    if (error) throw error;
    // Attach short-lived signed URLs so the client can render thumbnails directly
    // (the list previously returned only storage_path, so images never loaded).
    const xrays = await Promise.all((data || []).map(async (x) => {
      let url = null;
      if (x.storage_path) { try { url = await getSignedUrl('xrays', x.storage_path, 3600); } catch { /* skip */ } }
      return { ...x, url };
    }));
    res.json({ xrays });
  } catch (e) { next(e); }
});

// Shared aggregate used by BOTH the case-sheet JSON route and the case-sheet PDF route,
// so the document and the screen always reflect the exact same data. Returns null when
// the patient is out of scope / not found.
async function buildCaseSheet(patientId, req) {
  const today = new Date().toISOString().split('T')[0];

  // Clinic-scoped, not dentist-scoped: a doctor consulting a receptionist-checked-in
  // patient (different dentist_id) must still see the full case sheet.
  const scope = (q) => scoped(q, req);

  // lab_orders may not exist before migration 007 — keep it non-fatal.
  const safeLab = scope(supabase.from('lab_orders').select('*').eq('patient_id', patientId)).is('deleted_at', null).order('created_at', { ascending: false })
    .then(r => r.data || []).catch(() => []);

  const [patientRes, plansRes, visitsRes, prescRes, xraysRes, apptRes, labOrders] = await Promise.all([
    scope(supabase.from('patients').select('*').eq('id', patientId)).single(),
    scope(supabase.from('treatment_plans').select('*').eq('patient_id', patientId)).order('created_at', { ascending: false }),
    scope(supabase.from('visits').select(`*, visit_notes(*)`).eq('patient_id', patientId)).order('visit_date', { ascending: false }),
    scope(supabase.from('prescriptions').select('*').eq('patient_id', patientId)).order('created_at', { ascending: false }),
    supabase.from('xrays').select('id, xray_type, date_taken, created_at, tooth_number, notes, storage_path').eq('patient_id', patientId).is('deleted_at', null).order('created_at', { ascending: false }),
    // Include 'suggested' (consult-created) appointments, not just 'scheduled'.
    scope(supabase.from('appointments').select('*').eq('patient_id', patientId)).gte('appointment_date', today).neq('status', 'cancelled').order('appointment_date', { ascending: true }).limit(3),
    safeLab,
  ]);

  if (patientRes.error || !patientRes.data) return null;

  const totalBilled = (visitsRes.data || []).reduce((s, v) => s + (parseFloat(v.cost) || 0), 0);
  const totalPlannedCost = (plansRes.data || []).reduce((s, p) => s + (parseFloat(p.estimated_cost) || 0), 0);
  const totalCollected = (plansRes.data || []).reduce((s, p) => s + (parseFloat(p.collected_amount) || 0), 0);
  const activePlans = (plansRes.data || []).filter(p => p.status === 'active');

  return {
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
  };
}

router.get('/:id/case-sheet', async (req, res, next) => {
  try {
    const caseSheet = await buildCaseSheet(req.params.id, req);
    if (!caseSheet) return res.status(404).json({ error: 'Patient not found' });
    res.json(caseSheet);
  } catch (e) { next(e); }
});

// GET /api/patients/:id/case-sheet/pdf — same data as the JSON route, rendered to PDF.
router.get('/:id/case-sheet/pdf', async (req, res, next) => {
  try {
    const caseSheet = await buildCaseSheet(req.params.id, req);
    if (!caseSheet || !caseSheet.patient) return res.status(404).json({ error: 'Patient not found' });
    const { clinic, dentist } = await loadBrandingContext(req);
    const date = new Date().toISOString().split('T')[0];
    const buf = await generateCaseSheetPdf({ clinic, dentist, date, caseSheet });
    const fname = `CaseSheet_${(caseSheet.patient.name || 'patient').replace(/\s+/g, '_')}_${date}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fname}"`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (e) { next(e); }
});

// GET /api/patients/:id/statement/pdf — patient statement (charges + payments + balance).
router.get('/:id/statement/pdf', async (req, res, next) => {
  try {
    const scope = (q) => scoped(q, req);
    const { data: patient } = await scope(supabase.from('patients').select('name, phone').eq('id', req.params.id)).maybeSingle();
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const [paymentsRes, plansRes] = await Promise.all([
      supabase.from('payments').select('payment_date, amount, payment_method').eq('patient_id', req.params.id).order('payment_date', { ascending: false }),
      scope(supabase.from('treatment_plans').select('procedure_name, estimated_cost').eq('patient_id', req.params.id)).order('created_at', { ascending: false }),
    ]);
    const { clinic, dentist } = await loadBrandingContext(req);
    const date = new Date().toISOString().split('T')[0];
    const buf = await generateStatementPdf({ clinic, dentist, date, patient, payments: paymentsRes.data || [], plans: plansRes.data || [] });
    const fname = `Statement_${(patient.name || 'patient').replace(/\s+/g, '_')}_${date}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fname}"`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (e) { next(e); }
});

module.exports = router;
