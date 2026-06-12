// Orchestration services. Multi-table workflows live here (not in controllers or
// route handlers). Each method centralizes the writes, applies clinic scoping, and
// records an audit entry. supabase-js has no cross-statement transaction without an
// RPC, so these are sequenced best-effort with the critical write first and errors
// propagated; the few truly atomic needs (payment balance) are noted inline.

const supabase = require('../config/supabase');
const repos = require('./../repositories');
const aiService = require('./ai/ai.service');
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

// ── completeConsultation ──────────────────────────────────────────────────
async function completeConsultation(ctx) {
  const { clinicId, dentistId, staffId, requestId, queueId,
    patientId, diagnosis, toothNumber, toothNumbers, totalSittings, estimatedCost, transcript, notes, followUp } = ctx;
  // Never block checkout on a missing procedure — fall back to a generic label.
  const procedure = (ctx.procedure || '').trim() || 'Consultation';
  const todayStr = new Date().toISOString().split('T')[0];
  const sittings = Math.max(1, parseInt(totalSittings) || 1);

  // Normalise followUp into a concrete date + reason. Accepted shapes (the AI note and
  // the clients produce all three): 'YYYY-MM-DD', a number of days from today, or an
  // object { date | inDays/in_days, reason }. Anything unresolvable stays null.
  const isoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
  let followUpDate = null;
  let followUpReason = null;
  if (typeof followUp === 'number' && followUp > 0) {
    followUpDate = addDays(followUp);
  } else if (isoDate(followUp)) {
    followUpDate = String(followUp).trim();
  } else if (followUp && typeof followUp === 'object') {
    const days = followUp.inDays ?? followUp.in_days;
    if (isoDate(followUp.date)) followUpDate = String(followUp.date).trim();
    else if (typeof days === 'number' && days > 0) followUpDate = addDays(days);
    followUpReason = followUp.reason || null;
  }

  // Normalise the set of teeth covered by this procedure (multi-tooth). Falls back
  // to the single primary tooth. De-duplicated, strings only.
  const teeth = [...new Set(
    [...(Array.isArray(toothNumbers) ? toothNumbers : []), toothNumber]
      .filter((t) => t != null && String(t).trim() !== '')
      .map((t) => String(t).trim())
  )];

  // 1. Treatment plan (critical — propagate failure)
  const plan = await repos.treatmentPlans.create({
    patient_id: patientId,
    dentist_id: dentistId,
    clinic_id: clinicId || null,
    diagnosis: diagnosis || null,
    procedure_name: procedure,
    total_sittings: sittings,
    completed_sittings: 1,
    estimated_cost: estimatedCost ? parseFloat(estimatedCost) : 0,
    collected_amount: 0,
    status: 'active',
    start_date: todayStr,
  });

  // 2. Visit record (non-fatal)
  let visit = null;
  try {
    visit = await repos.visits.create({
      patient_id: patientId, dentist_id: dentistId, clinic_id: clinicId || null,
      visit_date: todayStr, procedure_name: procedure, tooth_number: toothNumber || null,
      status: 'completed', raw_transcript: transcript || null, notes: notes || null,
      sitting_number: 1, cost: estimatedCost ? parseFloat(estimatedCost) : null,
      follow_up_date: followUpDate,
    });
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
  //    or edit — not a blank time. Source of the dates, in priority order:
  //    (a) explicit dates the dentist dictated (ctx.appointments, resolved by Gemini),
  //    (b) multi-sitting → one suggested session per remaining sitting (weekly),
  //    (c) single-sitting with a follow-up date → one follow-up appointment.
  const appointments = [];
  let plan_specs = [];
  const aiAppts = Array.isArray(ctx.appointments)
    ? ctx.appointments.filter(a => a && /^\d{4}-\d{2}-\d{2}$/.test(String(a.date || '').trim()))
    : [];
  if (aiAppts.length) {
    plan_specs = aiAppts.map((a, i) => ({
      date: String(a.date).trim(),
      sitting: Number(a.session || a.sitting) || i + 2,
      purpose: (a.purpose || `${procedure} — Session ${i + 2}`).trim(),
    }));
  } else if (sittings > 1) {
    for (let i = 2; i <= sittings; i++) {
      const d = new Date(); d.setDate(d.getDate() + (i - 1) * 7);
      plan_specs.push({ date: d.toISOString().split('T')[0], sitting: i, purpose: `${procedure} — Session ${i}` });
    }
  }

  // A dictated follow-up ALWAYS becomes an appointment (it used to be dropped whenever
  // AI appointments or multi-sitting sessions were present) — unless one of those
  // already lands on the same date, which would just duplicate it.
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

  // 4. Prescription from transcript (non-fatal)
  let prescription = null;
  if (transcript) {
    try {
      const extracted = await aiService.extractPrescription(transcript);
      prescription = await repos.prescriptions.create({
        patient_id: patientId, dentist_id: dentistId, clinic_id: clinicId || null,
        visit_id: visit?.id || null, queue_entry_id: queueId,
        raw_voice: transcript, medicines: extracted.medicines || [],
        instructions: extracted.instructions || null, follow_up: extracted.followUp || null,
      }, '*, patients(name, age, gender, phone)');
    } catch (e) { /* non-fatal */ }
  }

  // 5. Link plan + notes on queue entry AND move it to checkout. Without the status
  //    change the patient never appears in the receptionist's "Ready for checkout"
  //    list (the frontend's optimistic status gets overwritten on the next reload).
  if (queueId) {
    const updates = {
      treatment_plan_id: plan.id,
      status: 'ready_for_checkout',
      consultation_outcome: 'treatment_done',
      updated_at: new Date().toISOString(),
    };
    if (notes) updates.notes = notes;
    await supabase.from('queue_entries').update(updates).eq('id', queueId).eq('clinic_id', clinicId);
  }

  audit.log({ clinicId, staffId, requestId, action: 'CONSULTATION', entityType: 'treatment_plan',
    entityId: plan.id, metadata: { queueId, patientId, hasVisit: !!visit, appts: appointments.length, hasRx: !!prescription } });

  return { plan, visit, appointments, prescription };
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
  completeConsultation,
  recordPayment,
  createTreatmentPlan,
  completeCheckout,
  createClinic,
  joinClinic,
};
