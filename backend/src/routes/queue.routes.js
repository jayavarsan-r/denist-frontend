const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { extractPrescription } = require('../services/ai.service');
const { ok, okCreated, fail } = require('../utils/response');

// GET /api/queue — today's queue for the clinic
router.get('/', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return fail(res, 403, 'FORBIDDEN', 'No clinic context');
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
    return ok(res, { queue: data || [] });
  } catch (e) { next(e); }
});

// GET /api/queue/action-queue — ready_for_checkout entries for receptionist
// Fixed: was N+1 (one prescription query per entry) → now one batch query for all entries
router.get('/action-queue', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return fail(res, 403, 'FORBIDDEN', 'No clinic context');
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
    if (entries.length === 0) return ok(res, { tasks: [] });

    // Batch: one query for all prescriptions in the last hour instead of N queries
    const patientIds = entries.map(e => e.patient_id);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: rxRows } = await supabase
      .from('prescriptions')
      .select('patient_id')
      .in('patient_id', patientIds)
      .gte('created_at', oneHourAgo);

    const rxPatientSet = new Set((rxRows || []).map(r => r.patient_id));

    const enriched = entries.map((entry) => {
      const pendingBalance = entry.treatment_plans
        ? parseFloat(entry.treatment_plans.pending_amount) || 0
        : 0;
      const needsAppointment = [
        'follow_up_scheduled', 'additional_sitting_required', 'treatment_postponed',
      ].includes(entry.consultation_outcome);
      return {
        ...entry,
        prescription_ready: rxPatientSet.has(entry.patient_id),
        amount_due: pendingBalance,
        needs_appointment: needsAppointment,
      };
    });

    return ok(res, { tasks: enriched });
  } catch (e) { next(e); }
});

// POST /api/queue — add patient to queue
router.post('/', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return fail(res, 403, 'FORBIDDEN', 'No clinic context');
    const { patientId, chiefComplaint, visitReason, priority, assignedDoctor, treatmentPlanId } = req.body;
    if (!patientId) return fail(res, 400, 'VALIDATION_ERROR', 'patientId required');

    const today = new Date().toISOString().split('T')[0];

    const { count } = await supabase
      .from('queue_entries')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', req.clinicId)
      .eq('queue_date', today);

    const nextToken = (count || 0) + 1;

    const { data, error } = await supabase.from('queue_entries').insert({
      clinic_id:         req.clinicId,
      patient_id:        patientId,
      treatment_plan_id: treatmentPlanId || null,
      added_by:          req.staffId || null,
      assigned_doctor:   assignedDoctor || null,
      chief_complaint:   chiefComplaint || null,
      visit_reason:      visitReason || null,
      priority:          priority || 'normal',
      queue_date:        today,
      token_number:      nextToken,
      sort_order:        nextToken,
      status:            'waiting',
    }).select(`
      *,
      patients(id, name, phone, age, gender),
      treatment_plans(id, procedure_name, total_sittings, completed_sittings)
    `).single();

    if (error) throw error;
    return okCreated(res, { entry: data });
  } catch (e) { next(e); }
});

// PATCH /api/queue/:id — update status, outcome, assigned doctor, sort_order
router.patch('/:id', auth, async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.status !== undefined)             updates.status = req.body.status;
    if (req.body.consultationOutcome !== undefined) updates.consultation_outcome = req.body.consultationOutcome;
    if (req.body.outcomeMetadata !== undefined)     updates.outcome_metadata = req.body.outcomeMetadata;
    if (req.body.assignedDoctor !== undefined)      updates.assigned_doctor = req.body.assignedDoctor;
    if (req.body.priority !== undefined)            updates.priority = req.body.priority;
    if (req.body.sortOrder !== undefined)           updates.sort_order = req.body.sortOrder;
    if (req.body.notes !== undefined)               updates.notes = req.body.notes;
    updates.updated_at = new Date().toISOString();

    if (!req.clinicId) return fail(res, 403, 'FORBIDDEN', 'No clinic context');

    const { data, error } = await supabase
      .from('queue_entries')
      .update(updates)
      .eq('id', req.params.id)
      .eq('clinic_id', req.clinicId)
      .select().single();

    if (error) throw error;
    if (!data) return fail(res, 404, 'NOT_FOUND', 'Queue entry not found');
    return ok(res, { entry: data });
  } catch (e) { next(e); }
});

// PATCH /api/queue/:id/reorder — move entry up or down in queue
router.patch('/:id/reorder', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return fail(res, 403, 'FORBIDDEN', 'No clinic context');
    const { direction } = req.body;
    if (!['up', 'down'].includes(direction)) return fail(res, 400, 'VALIDATION_ERROR', 'direction must be up or down');

    const today = new Date().toISOString().split('T')[0];
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
    if (idx === -1) return fail(res, 404, 'NOT_FOUND', 'Entry not found in waiting queue');

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= entries.length) {
      return ok(res, { entry: entries[idx], message: 'Already at boundary' });
    }

    const current = entries[idx];
    const swap = entries[swapIdx];
    const currentOrder = current.sort_order ?? current.token_number;
    const swapOrder = swap.sort_order ?? swap.token_number;

    await Promise.all([
      supabase.from('queue_entries').update({ sort_order: swapOrder, updated_at: new Date().toISOString() }).eq('id', current.id),
      supabase.from('queue_entries').update({ sort_order: currentOrder, updated_at: new Date().toISOString() }).eq('id', swap.id),
    ]);

    return ok(res, { success: true });
  } catch (e) { next(e); }
});

// POST /api/queue/:id/complete-consult — doctor only
// Creates: visit record + treatment plan + prescription + suggested appointment stubs
router.post('/:id/complete-consult', auth, requireRole(['doctor']), async (req, res, next) => {
  try {
    const { patientId, procedure, diagnosis, toothNumber, totalSittings, estimatedCost, transcript, notes } = req.body;
    if (!patientId || !procedure) {
      return fail(res, 400, 'VALIDATION_ERROR', 'patientId and procedure are required');
    }

    const today = new Date().toISOString().split('T')[0];
    const sittings = Math.max(1, parseInt(totalSittings) || 1);
    const estimatedCostNum = estimatedCost ? parseFloat(estimatedCost) : 0;

    // 1. Create treatment plan (FATAL — if this fails, nothing else runs)
    const { data: plan, error: planErr } = await supabase.from('treatment_plans').insert({
      patient_id:         patientId,
      dentist_id:         req.dentistId,
      clinic_id:          req.clinicId || null,
      diagnosis:          diagnosis || null,
      procedure_name:     procedure,
      total_sittings:     sittings,
      completed_sittings: 1,
      estimated_cost:     estimatedCostNum,
      collected_amount:   0,
      // pending_amount is a generated column — Postgres computes it automatically
      status:             'active',
      start_date:         today,
    }).select().single();

    if (planErr) throw planErr;

    // 2. Create a visit record for today's consultation (previously missing)
    let visit = null;
    try {
      const { data: visitData } = await supabase.from('visits').insert({
        patient_id:     patientId,
        dentist_id:     req.dentistId,
        clinic_id:      req.clinicId || null,
        procedure_name: procedure,
        tooth_number:   toothNumber || null,
        status:         'completed',
        notes:          notes || null,
        visit_date:     today,
        cost:           estimatedCostNum || null,
        currency:       'INR',
        raw_transcript: transcript || null,
      }).select().single();
      visit = visitData;
    } catch (visitErr) {
      console.error('[complete-consult] Visit creation (non-fatal):', visitErr.message);
    }

    // 3. Auto-generate future appointment stubs with status='suggested' (receptionist confirms time at checkout)
    const appointments = [];
    if (sittings > 1) {
      const inserts = [];
      for (let i = 2; i <= sittings; i++) {
        const d = new Date();
        d.setDate(d.getDate() + (i - 1) * 7);
        inserts.push({
          patient_id:       patientId,
          dentist_id:       req.dentistId,
          clinic_id:        req.clinicId || null,
          appointment_date: d.toISOString().split('T')[0],
          appointment_time: null,
          purpose:          `${procedure} — Session ${i}`,
          status:           'suggested',
        });
      }
      const { data: apptData, error: apptErr } = await supabase
        .from('appointments').insert(inserts).select();
      if (apptErr) console.error('[complete-consult] Auto-appointments (non-fatal):', apptErr.message);
      if (apptData) appointments.push(...apptData);
    }

    // 4. Create prescription from transcript (non-fatal)
    let prescription = null;
    if (transcript) {
      try {
        const extracted = await extractPrescription(transcript);
        const { data: rx } = await supabase.from('prescriptions').insert({
          patient_id:     patientId,
          dentist_id:     req.dentistId,
          clinic_id:      req.clinicId || null,
          visit_id:       visit?.id || null,
          queue_entry_id: req.params.id,
          raw_voice:      transcript,
          medicines:      extracted.medicines || [],
          instructions:   extracted.instructions || null,
          follow_up:      extracted.followUp || null,
        }).select('*, patients(name, age, gender, phone)').single();
        prescription = rx;
      } catch (rxErr) {
        console.error('[complete-consult] Prescription creation (non-fatal):', rxErr.message);
      }
    }

    // 5. Link treatment plan on queue entry and move to ready_for_checkout
    const queueUpdates = {
      treatment_plan_id: plan.id,
      status:            'ready_for_checkout',
      updated_at:        new Date().toISOString(),
    };
    if (notes) queueUpdates.notes = notes;

    const { error: queueErr } = await supabase.from('queue_entries')
      .update(queueUpdates)
      .eq('id', req.params.id)
      .eq('clinic_id', req.clinicId);

    if (queueErr) console.error('[complete-consult] Queue update (non-fatal):', queueErr.message);

    return okCreated(res, { plan, visit, appointments, prescription });
  } catch (e) { next(e); }
});

// DELETE /api/queue/:id — remove from queue
router.delete('/:id', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return fail(res, 403, 'FORBIDDEN', 'No clinic context');
    await supabase.from('queue_entries').delete().eq('id', req.params.id).eq('clinic_id', req.clinicId);
    return ok(res, { success: true });
  } catch (e) { next(e); }
});

// GET /api/queue/:id/context — consultation context screen data
router.get('/:id/context', auth, async (req, res, next) => {
  try {
    if (!req.clinicId) return fail(res, 403, 'FORBIDDEN', 'No clinic context');

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

    if (error || !entry) return fail(res, 404, 'NOT_FOUND', 'Queue entry not found');

    const patientId = entry.patient_id;
    const today = new Date().toISOString().split('T')[0];

    const [plansRes, lastVisitRes, todayXraysRes] = await Promise.all([
      supabase.from('treatment_plans')
        .select('id, procedure_name, total_sittings, completed_sittings, pending_amount, status, estimated_cost, collected_amount')
        .eq('patient_id', patientId).eq('status', 'active').limit(3),
      supabase.from('visits')
        .select('id, visit_date, procedure_name, notes, medications, cost, status')
        .eq('patient_id', patientId)
        .eq('dentist_id', req.dentistId)
        .order('visit_date', { ascending: false }).limit(1),
      supabase.from('xrays')
        .select('id, xray_type, date_taken, tooth_number, notes')
        .eq('patient_id', patientId).eq('date_taken', today),
    ]);

    const pendingBalance = (plansRes.data || []).reduce((s, p) => s + (parseFloat(p.pending_amount) || 0), 0);

    return ok(res, {
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
