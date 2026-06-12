// Orchestration services. Multi-table workflows live here (not in controllers or
// route handlers). Each method centralizes the writes, applies clinic scoping, and
// records an audit entry. supabase-js has no cross-statement transaction without an
// RPC, so these are sequenced best-effort with the critical write first and errors
// propagated; the few truly atomic needs (payment balance) are noted inline.

const supabase = require('../config/supabase');
const repos = require('./../repositories');
const audit = require('./audit.service');
const { outstandingFor, isOverpayment } = require('../utils/payment-math');
const { badRequest } = require('../utils/errors');

function makeJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
async function uniqueJoinCode() {
  let code, exists = true;
  while (exists) {
    code = makeJoinCode();
    const { data } = await supabase.from('clinics').select('id').eq('join_code', code).single();
    exists = !!data;
  }
  return code;
}
function makeDisplayId(city) {
  const prefix = city ? city.substring(0, 3).toUpperCase() : 'CLN';
  return `DENT-${prefix}-${String(Math.floor(100 + Math.random() * 900))}`;
}

const _toMin = (hhmm) => { const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number); return h * 60 + (m || 0); };
const _toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// Pick the first open 30-min-aligned time on `date` inside clinic hours, skipping
// existing (non-cancelled) appointments so a suggested visit lands on a real, free
// slot rather than a null time. Best-effort: any failure returns a sensible default.
async function firstFreeTime(clinicId, date, durationMins = 30, alreadyPicked = []) {
  const OPEN = 10 * 60, CLOSE = 18 * 60; // 10:00–18:00 default working window
  try {
    const { data: appts } = await supabase.from('appointments')
      .select('appointment_time, duration_minutes')
      .eq('clinic_id', clinicId).eq('appointment_date', date).neq('status', 'cancelled');
    const booked = [
      ...(appts || []).filter(a => a.appointment_time).map(a => {
        const s = _toMin(a.appointment_time); return [s, s + (a.duration_minutes || 30)];
      }),
      // Times we just assigned to earlier suggested sessions on this same date.
      ...alreadyPicked.map(t => { const s = _toMin(t); return [s, s + durationMins]; }),
    ];
    for (let t = OPEN; t + durationMins <= CLOSE; t += 30) {
      const clash = booked.some(([s, e]) => t < e && t + durationMins > s);
      if (!clash) return _toHHMM(t);
    }
  } catch { /* non-fatal — fall through to default */ }
  return _toHHMM(OPEN);
}

// ── confirmConsultationDraft ──────────────────────────────────────────────
// Phase 2: the doctor confirmed an AI draft on the Verification Card. This is the
// ONLY path that turns AI output into clinical records — nothing commits without
// this explicit confirmation. Sequenced like every other workflow here (critical
// write first, the rest best-effort, audit at the end).
//
// confirmedData is the (possibly doctor-edited) DraftSchema shape:
//   { treatments[], prescriptions[], follow_up, lab_case_suggestion, clinical_notes }
// plus optional UI extras: total_sittings, estimated_cost, diagnosis.
async function confirmConsultationDraft(ctx) {
  const { clinicId, dentistId, staffId, requestId, queueId, draft, confirmedData } = ctx;
  const { computeCorrections } = require('../utils/draft-diff');
  const patientId = draft.patient_id;
  const todayStr = new Date().toISOString().split('T')[0];

  const treatments = Array.isArray(confirmedData.treatments) ? confirmedData.treatments : [];
  const primary = treatments[0] || {};
  const procedure = (primary.procedure_name_span || confirmedData.procedure || '').trim() || 'Consultation';
  const teeth = [...new Set(treatments.map((t) => t.tooth_fdi).filter((t) => t != null).map(String))];
  const sittings = Math.max(1, parseInt(confirmedData.total_sittings) || parseInt(primary.sitting_number) || 1);
  const estimatedCost = confirmedData.estimated_cost != null ? parseFloat(confirmedData.estimated_cost) : 0;
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
  const followUpDate = confirmedData.follow_up?.in_days > 0 ? addDays(confirmedData.follow_up.in_days) : null;
  const followUpReason = confirmedData.follow_up?.reason || null;

  // Manual drafts (typed notes, no voice) carry no transcript — diffing them against
  // an empty extraction would record everything as a "correction" and poison the
  // few-shot learning loop, so corrections are voice-only.
  const corrections = draft.raw_transcript ? computeCorrections(draft.extracted, confirmedData) : {};

  // 0. Mark the draft confirmed FIRST (idempotency gate: a double-tap of the confirm
  //    button must not create the clinical records twice). Guarded on pending_review.
  const { data: claimed, error: claimErr } = await supabase
    .from('consultation_drafts')
    .update({
      status: 'confirmed',
      confirmed_data: confirmedData,
      corrections: Object.keys(corrections).length ? corrections : null,
      confirmed_by: staffId || null,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', draft.id).eq('clinic_id', clinicId).eq('status', 'pending_review')
    .select('id').maybeSingle();
  if (claimErr) throw claimErr;
  if (!claimed) {
    const err = new Error('draft_already_processed');
    err.status = 409;
    throw err;
  }

  // 1. Treatment plan (critical — propagate failure). Continuation-aware: when a
  //    confirmed sitting lands on a tooth that already has a matching active plan,
  //    increment that plan's sittings instead of opening a duplicate plan.
  let plan = null;
  const continuing = treatments.find((t) => t.sitting_action === 'continued' || t.sitting_action === 'completed');
  if (continuing && teeth.length) {
    try {
      const { data: candidates } = await supabase.from('treatment_plans')
        .select('id, procedure_name, total_sittings, completed_sittings, treatment_teeth(tooth_number)')
        .eq('patient_id', patientId).eq('clinic_id', clinicId)
        .in('status', ['active', 'in_progress']);
      const procWord = procedure.toLowerCase().split(' ')[0];
      const match = (candidates || []).find((p) => {
        const planTeeth = (p.treatment_teeth || []).map((l) => String(l.tooth_number));
        return teeth.some((t) => planTeeth.includes(t))
          && (p.procedure_name || '').toLowerCase().includes(procWord);
      });
      if (match) {
        const newCompleted = (match.completed_sittings || 0) + 1;
        const done = newCompleted >= (match.total_sittings || 1);
        const { data: updated } = await supabase.from('treatment_plans')
          .update({ completed_sittings: newCompleted, status: done ? 'completed' : 'active', updated_at: new Date().toISOString() })
          .eq('id', match.id).select().single();
        plan = updated;
      }
    } catch { /* fall through to creating a fresh plan */ }
  }
  if (!plan) {
    plan = await repos.treatmentPlans.create({
      patient_id: patientId,
      dentist_id: dentistId,
      clinic_id: clinicId || null,
      diagnosis: confirmedData.diagnosis || null,
      procedure_name: procedure,
      total_sittings: sittings,
      completed_sittings: 1,
      estimated_cost: estimatedCost,
      collected_amount: 0,
      status: 'active',
      start_date: todayStr,
    });
  }

  // 2. Visit record (non-fatal)
  let visit = null;
  try {
    visit = await repos.visits.create({
      patient_id: patientId, dentist_id: dentistId, clinic_id: clinicId || null,
      visit_date: todayStr, procedure_name: procedure, tooth_number: teeth[0] || null,
      status: 'completed', raw_transcript: draft.raw_transcript || null,
      notes: confirmedData.clinical_notes || null,
      sitting_number: continuing ? (plan.completed_sittings || 1) : 1,
      cost: estimatedCost || null,
      follow_up_date: followUpDate,
    });
    // Link the visit back onto the draft (drafts are created before the visit exists).
    await supabase.from('consultation_drafts')
      .update({ visit_id: visit.id }).eq('id', draft.id);
  } catch (e) { /* non-fatal — logged by caller via audit metadata */ }

  // 2b. Multi-tooth links — one row per tooth covered by this procedure, tied to
  //     both the plan and this sitting's visit. Powers per-tooth history + odontogram.
  //     Non-fatal: a missing treatment_teeth table (migration 007 not yet run) must
  //     not break consult completion.
  if (teeth.length) {
    try {
      await supabase.from('treatment_teeth').insert(
        teeth.map((t) => ({
          clinic_id: clinicId || null, patient_id: patientId,
          treatment_plan_id: plan.id, visit_id: visit?.id || null, tooth_number: t,
        }))
      );
    } catch (e) { /* non-fatal — table may not exist pre-migration */ }
  }

  // 3. Recommended appointments (non-fatal). Each is given a REAL free time on its
  //    date (availability-checked) so the receptionist sees a concrete slot to confirm
  //    or edit — not a blank time. Sources: remaining sittings (weekly), plus the
  //    confirmed follow-up (always becomes an appointment unless a sitting already
  //    lands on that date).
  const appointments = [];
  const plan_specs = [];
  const remainingFrom = (plan.completed_sittings || 1);
  for (let i = remainingFrom + 1; i <= (plan.total_sittings || sittings); i++) {
    const d = new Date(); d.setDate(d.getDate() + (i - remainingFrom) * 7);
    plan_specs.push({ date: d.toISOString().split('T')[0], sitting: i, purpose: `${procedure} — Session ${i}` });
  }
  if (followUpDate && !plan_specs.some((s) => s.date === followUpDate)) {
    plan_specs.push({
      date: followUpDate,
      sitting: plan_specs.length + 2,
      purpose: followUpReason ? `Follow-up: ${followUpReason}` : `${procedure} — Follow-up`,
    });
  }

  if (plan_specs.length) {
    const pickedByDate = {};
    const apptInserts = [];
    for (const spec of plan_specs) {
      const time = await firstFreeTime(clinicId, spec.date, 30, pickedByDate[spec.date] || []);
      (pickedByDate[spec.date] = pickedByDate[spec.date] || []).push(time);
      apptInserts.push({
        patient_id: patientId, dentist_id: dentistId, clinic_id: clinicId || null,
        appointment_date: spec.date, appointment_time: time,
        sitting_number: spec.sitting, purpose: spec.purpose, status: 'suggested',
      });
    }
    // duration_minutes may not exist pre-migration-008 — retry without it.
    let { data: apptData, error: apptErr } = await supabase
      .from('appointments').insert(apptInserts.map(a => ({ ...a, duration_minutes: 30 }))).select();
    if (apptErr) ({ data: apptData } = await supabase.from('appointments').insert(apptInserts).select());
    if (apptData) appointments.push(...apptData);
  }

  // 4. Prescription from the CONFIRMED data (non-fatal) — never re-extracted from
  //    the transcript; what the doctor approved on the card is what gets stored.
  //    Mapped into the legacy medicines jsonb shape the PDF/checkout screens read.
  let prescription = null;
  const confirmedRx = Array.isArray(confirmedData.prescriptions) ? confirmedData.prescriptions : [];
  if (confirmedRx.length) {
    try {
      const medicines = confirmedRx.map((rx) => ({
        name: rx.resolved_name || rx.medicine_name_span || '',
        dose: rx.dose || '',
        frequency: rx.frequency || '',
        duration: rx.duration_days ? `${rx.duration_days} days` : '',
        instructions: rx.instructions || '',
        item_id: rx.resolved_item_id || null,
        price_per_unit: rx.price_per_unit ?? null,
      }));
      prescription = await repos.prescriptions.create({
        patient_id: patientId, dentist_id: dentistId, clinic_id: clinicId || null,
        visit_id: visit?.id || null, queue_entry_id: queueId || null,
        raw_voice: draft.raw_transcript || null, medicines,
        instructions: confirmedData.clinical_notes || null,
        follow_up: followUpDate,
      }, '*, patients(name, age, gender, phone)');
    } catch (e) { /* non-fatal */ }
  }

  // 5. Lab case suggestion → DRAFT lab case for reception to complete. The lab_cases
  //    table arrives with Phase 4 (migration 013); until then the suggestion simply
  //    stays on the draft's confirmed_data — nothing is lost.
  if (confirmedData.lab_case_suggestion?.type) {
    try {
      const sug = confirmedData.lab_case_suggestion;
      await supabase.from('lab_cases').insert({
        clinic_id: clinicId, patient_id: patientId, visit_id: visit?.id || null,
        case_type: sug.type,
        tooth_fdi: sug.tooth_fdi != null ? [sug.tooth_fdi] : [],
        expected_date: sug.due_in_days ? addDays(sug.due_in_days) : null,
        status: 'DRAFT', created_by: staffId || null,
      });
    } catch { /* Phase 4 table not present yet — suggestion kept on the draft */ }
  }

  // 6. Link plan + move the queue entry to checkout (queue consults only). Without
  //    the status change the patient never appears in the receptionist's "Ready for
  //    checkout" list.
  if (queueId) {
    await supabase.from('queue_entries').update({
      treatment_plan_id: plan.id,
      status: 'ready_for_checkout',
      consultation_outcome: 'treatment_done',
      draft_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', queueId).eq('clinic_id', clinicId);
  }

  audit.log({ clinicId, staffId, requestId, action: 'CONSULTATION', entityType: 'consultation_draft',
    entityId: draft.id, metadata: { queueId, patientId, planId: plan.id, hasVisit: !!visit, appts: appointments.length, hasRx: !!prescription, corrections: Object.keys(corrections).length } });

  return { plan, visit, appointments, prescription, corrections };
}

// ── recordPayment ─────────────────────────────────────────────────────────
async function recordPayment(ctx) {
  const { clinicId, staffId, requestId, patientId, treatmentPlanId, queueEntryId,
    amount, paymentMethod, notes, paymentDate } = ctx;

  // Overpayment guard: when tied to a plan, a payment may not exceed the outstanding
  // balance. Ad-hoc payments (no plan) are unguarded — there is nothing to exceed.
  if (treatmentPlanId) {
    const { data: planRow } = await supabase.from('treatment_plans')
      .select('estimated_cost, collected_amount').eq('id', treatmentPlanId).single();
    if (planRow) {
      const outstanding = outstandingFor(planRow);
      if (isOverpayment(amount, outstanding)) {
        throw badRequest('Payment exceeds the outstanding balance', { outstanding, attempted: parseFloat(amount) });
      }
    }
  }

  const payment = await repos.payments.create({
    clinic_id: clinicId || null, patient_id: patientId,
    treatment_plan_id: treatmentPlanId || null, queue_entry_id: queueEntryId || null,
    received_by: staffId || null, amount: parseFloat(amount),
    payment_method: paymentMethod || 'cash', notes: notes || null,
    payment_date: paymentDate || new Date().toISOString().split('T')[0],
  });

  // Keep the plan balance in sync. NOTE: not atomic with the insert — if concurrent
  // payments race on the same plan this can drift; an RPC is the long-term fix
  // (see migrations/006). pending_amount is only written when it's a plain column.
  if (treatmentPlanId) {
    const { data: plan } = await supabase.from('treatment_plans')
      .select('collected_amount, estimated_cost').eq('id', treatmentPlanId).single();
    if (plan) {
      const newCollected = parseFloat(plan.collected_amount || 0) + parseFloat(amount);
      const patch = { collected_amount: newCollected };
      patch.pending_amount = Math.max(0, parseFloat(plan.estimated_cost || 0) - newCollected);
      const { error } = await supabase.from('treatment_plans').update(patch).eq('id', treatmentPlanId);
      // If pending_amount is a GENERATED column, retry without it.
      if (error) {
        await supabase.from('treatment_plans').update({ collected_amount: newCollected }).eq('id', treatmentPlanId);
      }
    }
  }

  audit.log({ clinicId, staffId, requestId, action: 'PAYMENT', entityType: 'payment',
    entityId: payment.id, metadata: { amount: payment.amount, treatmentPlanId } });

  return payment;
}

// ── createTreatmentPlan ───────────────────────────────────────────────────
async function createTreatmentPlan(ctx) {
  const { clinicId, dentistId, staffId, requestId, patientId, diagnosis, procedureName,
    totalSittings, estimatedCost, notes, startDate, expectedEndDate, metadata } = ctx;
  const plan = await repos.treatmentPlans.create({
    patient_id: patientId, dentist_id: dentistId, clinic_id: clinicId || null,
    diagnosis: diagnosis || null, procedure_name: procedureName,
    total_sittings: totalSittings || 1, completed_sittings: 0,
    estimated_cost: estimatedCost ? parseFloat(estimatedCost) : 0, collected_amount: 0,
    notes: notes || null, start_date: startDate || new Date().toISOString().split('T')[0],
    expected_end_date: expectedEndDate || null,
    metadata: metadata || {},
  });
  audit.log({ clinicId, staffId, requestId, action: 'CREATE', entityType: 'treatment_plan', entityId: plan.id });
  return plan;
}

// ── completeCheckout ──────────────────────────────────────────────────────
// Marks a queue entry completed and optionally records a payment in one step.
async function completeCheckout(ctx) {
  const { clinicId, staffId, requestId, queueId, payment: pay } = ctx;
  let payment = null;
  if (pay && pay.amount) {
    payment = await recordPayment({ clinicId, staffId, requestId, queueEntryId: queueId, ...pay });
  }
  const { data: queueEntry } = await supabase.from('queue_entries')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', queueId).eq('clinic_id', clinicId).select().maybeSingle();

  audit.log({ clinicId, staffId, requestId, action: 'CHECKOUT', entityType: 'queue_entry',
    entityId: queueId, metadata: { hasPayment: !!payment } });
  return { queueEntry, payment };
}

// ── createClinic ──────────────────────────────────────────────────────────
async function createClinic(ctx) {
  const { dentistId, requestId, clinicName, yourName, city, phone } = ctx;
  const joinCode = await uniqueJoinCode();
  const displayId = makeDisplayId(city);

  const { data: clinic, error: ce } = await supabase.from('clinics')
    .insert({ name: clinicName, city: city || null, join_code: joinCode, display_id: displayId })
    .select().single();
  if (ce) throw ce;

  const { data: staff, error: se } = await supabase.from('staff').insert({
    clinic_id: clinic.id, dentist_id: dentistId, phone: phone || '',
    name: yourName, role: 'doctor', status: 'active',
  }).select().single();
  if (se) throw se;

  await supabase.from('clinics').update({ owner_staff_id: staff.id }).eq('id', clinic.id);
  await supabase.from('dentists').update({ name: yourName, clinic_name: clinicName }).eq('id', dentistId);

  // Migrate this dentist's pre-clinic rows into the new clinic.
  for (const t of ['patients', 'visits', 'appointments', 'treatment_plans', 'prescriptions', 'xrays']) {
    await supabase.from(t).update({ clinic_id: clinic.id }).eq('dentist_id', dentistId).is('clinic_id', null);
  }

  audit.log({ clinicId: clinic.id, staffId: staff.id, requestId, action: 'CREATE', entityType: 'clinic', entityId: clinic.id });
  return { clinic: { ...clinic, owner_staff_id: staff.id }, staff };
}

// ── joinClinic ────────────────────────────────────────────────────────────
async function joinClinic(ctx) {
  const { dentistId, requestId, joinCode, yourName, role } = ctx;
  const { data: clinic } = await supabase.from('clinics').select('*').eq('join_code', joinCode.toUpperCase()).single();
  if (!clinic) return { error: 'NOT_FOUND' };

  const { data: dentist } = await supabase.from('dentists').select('*').eq('id', dentistId).single();

  const { data: staff, error: se } = await supabase.from('staff').insert({
    clinic_id: clinic.id, dentist_id: dentistId, phone: dentist?.phone || '',
    name: yourName, role, status: 'active',
  }).select().single();

  if (se) {
    if (se.code === '23505') { // already a member
      const { data: existing } = await supabase.from('staff').select('*')
        .eq('clinic_id', clinic.id).eq('dentist_id', dentistId).single();
      return { clinic, staff: existing, dentist, alreadyMember: true };
    }
    throw se;
  }

  await supabase.from('dentists').update({ name: yourName, clinic_name: clinic.name }).eq('id', dentistId);
  audit.log({ clinicId: clinic.id, staffId: staff.id, requestId, action: 'ROLE_CHANGE', entityType: 'staff',
    entityId: staff.id, metadata: { role, joined: true } });
  return { clinic, staff, dentist: { ...dentist, name: yourName } };
}

module.exports = {
  confirmConsultationDraft,
  recordPayment,
  createTreatmentPlan,
  completeCheckout,
  createClinic,
  joinClinic,
};
