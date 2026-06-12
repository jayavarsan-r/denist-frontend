const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const transaction = require('../services/transaction.service');
const { parsePagination, pageMeta } = require('../utils/pagination');

// GET /api/queue — today's queue for the clinic
router.get('/', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('queue_entries')
      .select(`
        *,
        patients(id, name, phone, age, gender, allergies, clinical_flags),
        treatment_plans(id, procedure_name, total_sittings, completed_sittings, pending_amount),
        added_by_staff:added_by(id, name, role),
        assigned_doctor_staff:assigned_doctor(id, name, role)
      `)
      .eq('clinic_id', req.clinicId)
      .eq('queue_date', today)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('token_number', { ascending: true });

    if (error) throw error;
    res.json({ queue: data || [] });
  } catch (e) { next(e); }
});

// GET /api/queue/action-queue — ready_for_checkout entries for receptionist
router.get('/action-queue', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('queue_entries')
      .select(`
        *,
        patients(id, name, phone, age, gender),
        treatment_plans(id, procedure_name, total_sittings, completed_sittings, pending_amount, estimated_cost, collected_amount),
        assigned_doctor_staff:assigned_doctor(id, name, role)
      `)
      .eq('clinic_id', req.clinicId)
      .eq('queue_date', today)
      .eq('status', 'ready_for_checkout')
      .order('updated_at', { ascending: true });

    if (error) throw error;

    const entries = data || [];

    // Batch the prescription-ready lookup into ONE query (was N+1: one per entry).
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const patientIds = [...new Set(entries.map(e => e.patient_id).filter(Boolean))];
    let recentRxPatients = new Set();
    if (patientIds.length) {
      const { data: rxRows } = await supabase
        .from('prescriptions')
        .select('patient_id')
        .in('patient_id', patientIds)
        .gte('created_at', oneHourAgo);
      recentRxPatients = new Set((rxRows || []).map(r => r.patient_id));
    }

    const NEEDS_APPT = ['follow_up_scheduled', 'additional_sitting_required', 'treatment_postponed'];
    const enriched = entries.map((entry) => ({
      ...entry,
      prescription_ready: recentRxPatients.has(entry.patient_id),
      amount_due: entry.treatment_plans ? parseFloat(entry.treatment_plans.pending_amount) || 0 : 0,
      needs_appointment: NEEDS_APPT.includes(entry.consultation_outcome),
    }));

    res.json({ tasks: enriched });
  } catch (e) { next(e); }
});

// GET /api/queue/history — past queue entries (paginated, optional ?fromDate&toDate)
router.get('/history', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { from, to, page, limit } = parsePagination(req.query);
    let q = supabase.from('queue_entries')
      .select('*, patients(id, name, phone)', { count: 'exact' })
      .eq('clinic_id', req.clinicId);
    if (req.query.fromDate) q = q.gte('queue_date', req.query.fromDate);
    if (req.query.toDate) q = q.lte('queue_date', req.query.toDate);
    q = q.order('queue_date', { ascending: false }).order('token_number', { ascending: true }).range(from, to);
    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ entries: data || [], pagination: pageMeta({ page, limit }, count) });
  } catch (e) { next(e); }
});

// POST /api/queue — add patient to queue
const QUEUE_SELECT = `
  *,
  patients(id, name, phone, age, gender),
  treatment_plans(id, procedure_name, total_sittings, completed_sittings)
`;

router.post('/', auth, validate(v.addToQueue), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, chiefComplaint, visitReason, priority, assignedDoctor, treatmentPlanId } = req.body;
    if (!patientId) return res.status(400).json({ error: 'patientId required' });

    const today = new Date().toISOString().split('T')[0];

    // Idempotent check-in: if this patient already has an ACTIVE entry today, return it
    // instead of failing/duplicating. This is what makes "add an existing patient again"
    // succeed cleanly (it was surfacing as "Check-in failed") and also sidesteps any
    // unique constraint a drifted DB might carry.
    const { data: existing } = await supabase.from('queue_entries')
      .select(QUEUE_SELECT)
      .eq('clinic_id', req.clinicId).eq('queue_date', today).eq('patient_id', patientId)
      .in('status', ['waiting', 'in_consultation', 'ready_for_checkout'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing) return res.status(200).json({ entry: existing, alreadyInQueue: true });

    const { count } = await supabase
      .from('queue_entries')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', req.clinicId)
      .eq('queue_date', today);

    // Full row, then progressively smaller fallbacks so a schema-drifted DB (missing an
    // optional column) can't turn check-in into a hard failure. Token collisions (23505)
    // recompute and retry once.
    const insertEntry = async (tokenNumber) => {
      const full = {
        clinic_id:         req.clinicId,
        patient_id:        patientId,
        treatment_plan_id: treatmentPlanId || null,
        added_by:          req.staffId || null,
        assigned_doctor:   assignedDoctor || null,
        chief_complaint:   chiefComplaint || null,
        visit_reason:      visitReason || null,
        priority:          priority || 'normal',
        queue_date:        today,
        token_number:      tokenNumber,
        sort_order:        tokenNumber,
        status:            'waiting',
      };
      const minimal = {
        clinic_id: req.clinicId, patient_id: patientId, chief_complaint: chiefComplaint || null,
        priority: priority || 'normal', queue_date: today, token_number: tokenNumber, status: 'waiting',
      };
      let { data, error } = await supabase.from('queue_entries').insert(full).select(QUEUE_SELECT).single();
      if (error && /column|schema|does not exist/i.test(error.message || '')) {
        ({ data, error } = await supabase.from('queue_entries').insert(minimal).select(QUEUE_SELECT).single());
      }
      return { data, error };
    };

    let tok = (count || 0) + 1;
    let { data, error } = await insertEntry(tok);
    if (error && error.code === '23505') {
      // Token raced with another check-in — recompute from the current max and retry once.
      const { data: maxRow } = await supabase.from('queue_entries')
        .select('token_number').eq('clinic_id', req.clinicId).eq('queue_date', today)
        .order('token_number', { ascending: false }).limit(1).maybeSingle();
      tok = ((maxRow?.token_number) || tok) + 1;
      ({ data, error } = await insertEntry(tok));
    }
    if (error) throw error;
    res.status(201).json({ entry: data });
  } catch (e) { next(e); }
});

// PATCH /api/queue/:id — update status, outcome, assigned doctor, sort_order
router.patch('/:id', auth, validate(v.patchQueue), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const updates = {};
    if (req.body.status !== undefined)             updates.status = req.body.status;
    if (req.body.consultationOutcome !== undefined) updates.consultation_outcome = req.body.consultationOutcome;
    if (req.body.outcomeMetadata !== undefined)     updates.outcome_metadata = req.body.outcomeMetadata;
    if (req.body.assignedDoctor !== undefined)      updates.assigned_doctor = req.body.assignedDoctor;
    if (req.body.priority !== undefined)            updates.priority = req.body.priority;
    if (req.body.sortOrder !== undefined)           updates.sort_order = req.body.sortOrder;
    if (req.body.notes !== undefined)               updates.notes = req.body.notes;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('queue_entries')
      .update(updates)
      .eq('id', req.params.id)
      .eq('clinic_id', req.clinicId)
      .select().single();

    if (error) throw error;
    res.json({ entry: data });
  } catch (e) { next(e); }
});

// PATCH /api/queue/:id/reorder — move entry up or down in queue
router.patch('/:id/reorder', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { direction } = req.body; // 'up' | 'down'
    if (!['up', 'down'].includes(direction)) return res.status(400).json({ error: 'direction must be up or down' });

    const today = new Date().toISOString().split('T')[0];

    // Get all waiting entries ordered by sort_order
    const { data: entries, error: listError } = await supabase
      .from('queue_entries')
      .select('id, sort_order, token_number')
      .eq('clinic_id', req.clinicId)
      .eq('queue_date', today)
      .eq('status', 'waiting')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('token_number', { ascending: true });

    if (listError) throw listError;

    const idx = entries.findIndex(e => e.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Entry not found in waiting queue' });

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= entries.length) {
      return res.json({ entry: entries[idx], message: 'Already at boundary' });
    }

    const current = entries[idx];
    const swap = entries[swapIdx];

    const currentOrder = current.sort_order ?? current.token_number;
    const swapOrder = swap.sort_order ?? swap.token_number;

    // Swap sort_order values
    await Promise.all([
      supabase.from('queue_entries').update({ sort_order: swapOrder, updated_at: new Date().toISOString() }).eq('id', current.id),
      supabase.from('queue_entries').update({ sort_order: currentOrder, updated_at: new Date().toISOString() }).eq('id', swap.id),
    ]);

    res.json({ success: true });
  } catch (e) { next(e); }
});

// GET /api/queue/:id/checkout-summary — persisted consultation data for the checkout
// screen (works for ANY user/session, unlike the doctor's ephemeral client state).
// Pulls the linked treatment plan, its teeth, the prescription, and upcoming appointments.
router.get('/:id/checkout-summary', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { id } = req.params;
    const { data: entry, error } = await supabase.from('queue_entries')
      .select('*, patients(id, name, phone, age, gender, allergies, clinical_flags), treatment_plans(*)')
      .eq('id', id).eq('clinic_id', req.clinicId).maybeSingle();
    if (error) throw error;
    if (!entry) return res.status(404).json({ error: 'Queue entry not found' });

    const plan = entry.treatment_plans || null;
    const planId = plan?.id || entry.treatment_plan_id || null;
    const today = new Date().toISOString().split('T')[0];
    const safe = async (p) => { try { const { data } = await p; return data || []; } catch { return []; } };

    const [teethRows, prescRows, appts] = await Promise.all([
      planId ? safe(supabase.from('treatment_teeth').select('tooth_number').eq('treatment_plan_id', planId)) : Promise.resolve([]),
      safe(supabase.from('prescriptions').select('*').eq('queue_entry_id', id).order('created_at', { ascending: false })),
      // Clinic-scoped, NOT dentist-scoped: appointments are created with the doctor's
      // dentist_id, so a receptionist viewing checkout must match on clinic to see them
      // (otherwise "0 future visits" even when sittings were scheduled).
      safe(supabase.from('appointments').select('*').eq('patient_id', entry.patient_id).eq('clinic_id', req.clinicId).gte('appointment_date', today).neq('status', 'cancelled').order('appointment_date')),
    ]);

    const teeth = [...new Set(teethRows.map(t => t.tooth_number).filter(Boolean))];
    const presc = prescRows[0] || null;

    res.json({
      summary: {
        queueEntryId: id,
        patient: entry.patients || null,
        tokenNumber: entry.token_number,
        outcome: entry.consultation_outcome || null,
        treatmentPlanId: planId,
        procedure: plan?.procedure_name || '',
        diagnosis: plan?.diagnosis || '',
        tooth: teeth[0] || null,
        teeth,
        totalSittings: plan?.total_sittings || 1,
        sittingDone: plan?.completed_sittings || 1,
        estimatedCost: plan?.estimated_cost != null ? parseFloat(plan.estimated_cost) : 0,
        collectedAmount: plan?.collected_amount != null ? parseFloat(plan.collected_amount) : 0,
        pendingAmount: plan?.pending_amount != null ? parseFloat(plan.pending_amount) : 0,
        appointments: appts.map(a => ({ id: a.id, date: a.appointment_date, time: a.appointment_time, purpose: a.purpose, status: a.status, sittingNumber: a.sitting_number })),
        medicines: Array.isArray(presc?.medicines) ? presc.medicines.map(m => ({
          name: m.name || '', dose: m.dose || m.dosage || '', frequency: m.frequency || '',
          duration: m.duration || '', timing: m.timing || '',
          slots: m.meal_timing_slots || m.slots || { breakfast: false, lunch: false, dinner: false },
        })) : [],
        instructions: presc?.instructions || '',
        prescriptionId: presc?.id || null,
      },
    });
  } catch (e) { next(e); }
});

// POST /api/queue/:id/complete-consult — orchestrated by the transaction service:
// treatment plan + visit + suggested appointments + prescription + queue link + audit.
router.post('/:id/complete-consult', auth, validate(v.completeConsult), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    let { patientId } = req.body;
    const { procedure, diagnosis, toothNumber, toothNumbers, totalSittings, estimatedCost, transcript, notes, followUp, appointments } = req.body;

    // The queue entry already knows the patient — default from it so the client
    // never has to resend patientId (was a silent 400 trap).
    if (!patientId) {
      const { data: entry } = await supabase.from('queue_entries')
        .select('patient_id').eq('id', req.params.id).eq('clinic_id', req.clinicId).maybeSingle();
      if (!entry) return res.status(404).json({ error: 'Queue entry not found' });
      patientId = entry.patient_id;
    }

    const result = await transaction.completeConsultation({
      clinicId: req.clinicId, dentistId: req.dentistId, staffId: req.staffId, requestId: req.id,
      queueId: req.params.id,
      patientId, procedure, diagnosis, toothNumber, toothNumbers, totalSittings, estimatedCost, transcript, notes, followUp, appointments,
    });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

// POST /api/queue/:id/checkout — mark completed + optional payment (transaction service)
router.post('/:id/checkout', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const result = await transaction.completeCheckout({
      clinicId: req.clinicId, staffId: req.staffId, requestId: req.id,
      queueId: req.params.id, payment: req.body?.payment || null,
    });
    res.json(result);
  } catch (e) { next(e); }
});

// DELETE /api/queue/:id — remove from queue
router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    await supabase.from('queue_entries').delete().eq('id', req.params.id).eq('clinic_id', req.clinicId);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// GET /api/queue/:id/context — consultation context screen data
router.get('/:id/context', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { data: entry, error } = await supabase
      .from('queue_entries')
      .select(`
        *,
        patients(id, name, phone, age, gender, allergies, medical_conditions, clinical_flags),
        treatment_plans(id, procedure_name, total_sittings, completed_sittings, pending_amount, estimated_cost, collected_amount, diagnosis),
        assigned_doctor_staff:assigned_doctor(id, name)
      `)
      .eq('id', req.params.id)
      .eq('clinic_id', req.clinicId)
      .single();

    if (error || !entry) return res.status(404).json({ error: 'Queue entry not found' });

    const patientId = entry.patient_id;
    const today = new Date().toISOString().split('T')[0];

    // patientId comes from a clinic-verified queue entry, but every sub-query still
    // carries the clinic_id filter — the tenancy boundary holds even if a row was
    // mis-stamped or the entry check changes later.
    const [plansRes, lastVisitRes, todayXraysRes] = await Promise.all([
      supabase.from('treatment_plans')
        .select('id, procedure_name, total_sittings, completed_sittings, pending_amount, status, estimated_cost, collected_amount')
        .eq('patient_id', patientId).eq('clinic_id', req.clinicId).eq('status', 'active').limit(3),
      supabase.from('visits')
        .select('id, visit_date, procedure_name, notes, medications, cost, status')
        .eq('patient_id', patientId).eq('clinic_id', req.clinicId)
        .order('visit_date', { ascending: false }).limit(1),
      supabase.from('xrays')
        .select('id, xray_type, date_taken, tooth_number, notes')
        .eq('patient_id', patientId).eq('clinic_id', req.clinicId).eq('date_taken', today),
    ]);

    const pendingBalance = (plansRes.data || []).reduce((s, p) => s + (parseFloat(p.pending_amount) || 0), 0);

    res.json({
      queueEntry:    entry,
      patient:       entry.patients,
      activePlans:   plansRes.data || [],
      lastVisit:     lastVisitRes.data?.[0] || null,
      todayXrays:    todayXraysRes.data || [],
      pendingBalance,
    });
  } catch (e) { next(e); }
});

module.exports = router;
