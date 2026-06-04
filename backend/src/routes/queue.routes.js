const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const { extractPrescription } = require('../services/ai.service');

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

    // Enrich with prescription_ready flag
    const entries = data || [];
    const enriched = await Promise.all(entries.map(async (entry) => {
      const patientId = entry.patient_id;
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { count: rxCount } = await supabase
        .from('prescriptions')
        .select('id', { count: 'exact', head: true })
        .eq('patient_id', patientId)
        .gte('created_at', oneHourAgo);

      const pendingBalance = entry.treatment_plans
        ? parseFloat(entry.treatment_plans.pending_amount) || 0
        : 0;

      const needsAppointment = [
        'follow_up_scheduled',
        'additional_sitting_required',
        'treatment_postponed',
      ].includes(entry.consultation_outcome);

      return {
        ...entry,
        prescription_ready: (rxCount || 0) > 0,
        amount_due: pendingBalance,
        needs_appointment: needsAppointment,
      };
    }));

    res.json({ tasks: enriched });
  } catch (e) { next(e); }
});

// POST /api/queue — add patient to queue
router.post('/', auth, validate(v.addToQueue), async (req, res, next) => {
  try {
    if (!req.clinicId) return res.status(403).json({ error: 'No clinic context' });
    const { patientId, chiefComplaint, visitReason, priority, assignedDoctor, treatmentPlanId } = req.body;
    if (!patientId) return res.status(400).json({ error: 'patientId required' });

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
    res.status(201).json({ entry: data });
  } catch (e) { next(e); }
});

// PATCH /api/queue/:id — update status, outcome, assigned doctor, sort_order
router.patch('/:id', auth, validate(v.patchQueue), async (req, res, next) => {
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

// POST /api/queue/:id/complete-consult — treatment plan + visit + appointments + prescription
router.post('/:id/complete-consult', auth, validate(v.completeConsult), async (req, res, next) => {
  try {
    const {
      patientId,
      procedure,
      diagnosis,
      toothNumber,
      totalSittings,
      estimatedCost,
      transcript,
      notes,
    } = req.body;

    if (!patientId || !procedure) {
      return res.status(400).json({ error: 'patientId and procedure are required' });
    }

    const today = new Date().toISOString().split('T')[0];
    const sittings = Math.max(1, parseInt(totalSittings) || 1);

    // NOTE: This endpoint orchestrates 4 writes and is NOT yet transactional.
    // TODO(Phase 5): move into TransactionService.completeConsultation() so plan +
    // visit + appointments + prescription + queue update commit atomically.

    // 1. Create treatment plan
    const { data: plan, error: planErr } = await supabase.from('treatment_plans').insert({
      patient_id:         patientId,
      dentist_id:         req.dentistId,
      clinic_id:          req.clinicId || null,
      diagnosis:          diagnosis || null,
      procedure_name:     procedure,
      total_sittings:     sittings,
      completed_sittings: 1,
      estimated_cost:     estimatedCost ? parseFloat(estimatedCost) : 0,
      collected_amount:   0,
      status:             'active',
      start_date:         today,
    }).select().single();

    if (planErr) throw planErr;

    // 2. Record this consultation session as a visit (was previously missing —
    //    today's session was never recorded in `visits`). Non-fatal.
    let visit = null;
    try {
      const { data: v } = await supabase.from('visits').insert({
        patient_id:     patientId,
        dentist_id:     req.dentistId,
        clinic_id:      req.clinicId || null,
        visit_date:     today,
        procedure_name: procedure,
        tooth_number:   toothNumber || null,
        status:         'completed',
        raw_transcript: transcript || null,
        notes:          notes || null,
        sitting_number: 1,
        cost:           estimatedCost ? parseFloat(estimatedCost) : null,
      }).select().single();
      visit = v;
    } catch (visitErr) {
      console.error('Visit record (non-fatal):', visitErr.message);
    }

    // 3. Auto-generate SUGGESTED appointment stubs (sessions 2..N). No time is set
    //    and status is 'suggested' — the receptionist confirms date/time at checkout.
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
          sitting_number:   i,
          purpose:          `${procedure} — Session ${i}`,
          status:           'suggested',
        });
      }
      const { data: apptData, error: apptErr } = await supabase
        .from('appointments').insert(inserts).select();
      if (apptErr) console.error('Auto-appointments (non-fatal):', apptErr.message);
      if (apptData) appointments.push(...apptData);
    }

    // 4. Create prescription from transcript (non-fatal if it fails)
    let prescription = null;
    if (transcript) {
      try {
        const extracted = await extractPrescription(transcript);
        const { data: rx } = await supabase.from('prescriptions').insert({
          patient_id:    patientId,
          dentist_id:    req.dentistId,
          clinic_id:     req.clinicId || null,
          visit_id:      visit?.id || null,
          queue_entry_id: req.params.id,
          raw_voice:     transcript,
          medicines:     extracted.medicines || [],
          instructions:  extracted.instructions || null,
          follow_up:     extracted.followUp || null,
        }).select('*, patients(name, age, gender, phone)').single();
        prescription = rx;
      } catch (rxErr) {
        console.error('Prescription creation (non-fatal):', rxErr.message);
      }
    }

    // 5. Link treatment plan + save notes on queue entry
    const queueUpdates = { treatment_plan_id: plan.id, updated_at: new Date().toISOString() };
    if (notes) queueUpdates.notes = notes;

    await supabase.from('queue_entries')
      .update(queueUpdates)
      .eq('id', req.params.id)
      .eq('clinic_id', req.clinicId);

    res.status(201).json({ plan, visit, appointments, prescription });
  } catch (e) { next(e); }
});

// DELETE /api/queue/:id — remove from queue
router.delete('/:id', auth, async (req, res, next) => {
  try {
    await supabase.from('queue_entries').delete().eq('id', req.params.id).eq('clinic_id', req.clinicId);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// GET /api/queue/:id/context — consultation context screen data
router.get('/:id/context', auth, async (req, res, next) => {
  try {
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

    const [plansRes, lastVisitRes, todayXraysRes] = await Promise.all([
      supabase.from('treatment_plans')
        .select('id, procedure_name, total_sittings, completed_sittings, pending_amount, status, estimated_cost, collected_amount')
        .eq('patient_id', patientId).eq('status', 'active').limit(3),
      supabase.from('visits')
        .select('id, visit_date, procedure_name, notes, medications, cost, status')
        .eq('patient_id', patientId)
        .order('visit_date', { ascending: false }).limit(1),
      supabase.from('xrays')
        .select('id, xray_type, date_taken, tooth_number, notes')
        .eq('patient_id', patientId).eq('date_taken', today),
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
