const router = require('express').Router();
const ctrl = require('../controllers/patients.controller');
const auth = require('../middleware/auth');
const supabase = require('../config/supabase');

router.use(auth);
router.get('/', ctrl.list);
router.post('/', ctrl.create);

// Tooth history — must come before /:id to avoid conflict
router.get('/:id/tooth-history', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data: visits, error } = await supabase
      .from('visits')
      .select('*')
      .eq('patient_id', id)
      .eq('dentist_id', req.dentistId)
      .order('visit_date', { ascending: false });

    if (error) throw error;

    const { data: appointments } = await supabase
      .from('appointments')
      .select('*')
      .eq('patient_id', id)
      .eq('dentist_id', req.dentistId)
      .gte('appointment_date', new Date().toISOString().split('T')[0])
      .neq('status', 'cancelled')
      .order('appointment_date');

    // Separate tooth visits from general visits
    const toothVisits = (visits || []).filter(v => v.tooth_number);
    const generalVisits = (visits || []).filter(v => !v.tooth_number);

    // Group by tooth number
    const toothMap = new Map();
    toothVisits.forEach(v => {
      const tn = v.tooth_number;
      if (!toothMap.has(tn)) {
        toothMap.set(tn, {
          toothNumber: tn,
          completedProcedures: [],
          upcomingAppointments: [],
          totalCost: 0,
          lastProcedureDate: null,
          overallStatus: 'treated',
        });
      }
      const entry = toothMap.get(tn);
      entry.completedProcedures.push({
        visitId: v.id,
        date: v.visit_date,
        procedure: v.procedure_name,
        status: v.status,
        notes: v.notes,
        cost: v.cost != null ? parseFloat(v.cost) : null,
        followUpDate: v.follow_up_date,
      });
      if (v.cost != null) entry.totalCost += parseFloat(v.cost);
      if (!entry.lastProcedureDate || v.visit_date > entry.lastProcedureDate) {
        entry.lastProcedureDate = v.visit_date;
      }
    });

    // Attach upcoming appointments by tooth
    (appointments || []).forEach(a => {
      if (a.tooth_number && toothMap.has(a.tooth_number)) {
        const entry = toothMap.get(a.tooth_number);
        entry.upcomingAppointments.push({
          appointmentId: a.id,
          date: a.appointment_date,
          time: a.appointment_time,
          purpose: a.purpose,
          status: a.status,
        });
      }
    });

    // Compute overallStatus
    toothMap.forEach(entry => {
      const hasCompleted = entry.completedProcedures.length > 0;
      const hasPending = entry.upcomingAppointments.length > 0;
      if (hasCompleted && hasPending) entry.overallStatus = 'treated_pending';
      else if (hasPending) entry.overallStatus = 'pending';
      else entry.overallStatus = 'treated';
    });

    const totalBilled = Array.from(toothMap.values()).reduce((sum, t) => sum + t.totalCost, 0)
      + (visits || []).reduce((sum, v) => sum + (v.tooth_number ? 0 : (v.cost != null ? parseFloat(v.cost) : 0)), 0);

    res.json({
      patientId: id,
      toothMap: Array.from(toothMap.values()),
      generalVisits,
      totalBilled,
    });
  } catch (e) { next(e); }
});

router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
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

    const [patientRes, plansRes, visitsRes, prescRes, xraysRes, apptRes] = await Promise.all([
      supabase.from('patients').select('*').eq('id', patientId).eq('dentist_id', req.dentistId).single(),
      supabase.from('treatment_plans').select('*').eq('patient_id', patientId).eq('dentist_id', req.dentistId).order('created_at', { ascending: false }),
      supabase.from('visits').select(`*, visit_notes(*)`).eq('patient_id', patientId).eq('dentist_id', req.dentistId).order('visit_date', { ascending: false }),
      supabase.from('prescriptions').select('*').eq('patient_id', patientId).eq('dentist_id', req.dentistId).order('created_at', { ascending: false }),
      supabase.from('xrays').select('id, xray_type, date_taken, tooth_number, notes').eq('patient_id', patientId).eq('dentist_id', req.dentistId).order('date_taken', { ascending: false }),
      supabase.from('appointments').select('*').eq('patient_id', patientId).eq('dentist_id', req.dentistId).gte('appointment_date', today).eq('status', 'scheduled').order('appointment_date', { ascending: true }).limit(3),
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
