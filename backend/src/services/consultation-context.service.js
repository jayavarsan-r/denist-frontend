const supabase = require('../config/supabase');

// Context injection for the voice pipeline: plain SQL snapshots stuffed into the
// Gemini prompt — exact data, no similarity search, no vectors (per architecture
// principle #7). Every query is clinic-scoped.
//
// Schema notes (this DB, not the generic spec):
//   • patients.allergies / medical_conditions / clinical_flags are TEXT — allergies
//     are normalised into a list here so the safety net can match per-allergy.
//   • treatment plans have no tooth column; teeth come via treatment_teeth links.
//   • inventory_items lands in Phase 3 and procedures in migration 014 — both are
//     fetched non-fatally so the pipeline works before those migrations run.

// 'penicillin, sulfa drugs / latex; aspirin' → ['penicillin','sulfa drugs','latex','aspirin']
function splitAllergies(text) {
  if (Array.isArray(text)) return text.filter(Boolean).map((s) => String(s).trim()).filter(Boolean);
  if (!text || typeof text !== 'string') return [];
  return text.split(/[,;/\n]+/).map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== 'none');
}

// Non-fatal fetch: a missing table (pre-migration) must not kill the whole job.
async function safeRows(promise) {
  try {
    const { data } = await promise;
    return data || [];
  } catch {
    return [];
  }
}

async function buildConsultationContext(clinicId, patientId, doctorId) {
  const [patientRes, plans, lastVisitRes, medicines, procedureCatalog, fewShots] = await Promise.all([
    // 1. Patient snapshot — safety-critical, injected verbatim
    supabase.from('patients')
      .select('id, name, age, gender, allergies, medical_conditions, clinical_flags, phone')
      .eq('id', patientId).eq('clinic_id', clinicId).maybeSingle(),

    // 2. Active treatment plans (+ teeth via the link table, below)
    safeRows(supabase.from('treatment_plans')
      .select('id, procedure_name, total_sittings, completed_sittings, status, notes, estimated_cost')
      .eq('patient_id', patientId).eq('clinic_id', clinicId)
      .in('status', ['active', 'in_progress'])),

    // 3. Last visit summary
    supabase.from('visits')
      .select('visit_date, procedure_name, tooth_number, notes, created_at')
      .eq('patient_id', patientId).eq('clinic_id', clinicId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),

    // 4. Clinic medicine master (Phase 3 table — empty list until it exists)
    safeRows(supabase.from('inventory_items')
      .select('id, name, strength, unit, price_per_unit, stock_qty')
      .eq('clinic_id', clinicId).eq('category', 'medicine').eq('active', true)
      .order('name')),

    // 5. Procedure catalog (migration 014)
    safeRows(supabase.from('procedures')
      .select('name, code, default_sittings, default_fee')
      .eq('clinic_id', clinicId).eq('active', true)
      .order('name')),

    // 6. Per-doctor few-shot correction pairs — the learning loop, no vectors
    doctorId
      ? safeRows(supabase.from('consultation_drafts')
          .select('raw_transcript, corrections')
          .eq('doctor_id', doctorId).eq('clinic_id', clinicId)
          .eq('status', 'confirmed').not('corrections', 'is', null)
          .not('raw_transcript', 'is', null) // manual drafts carry no voice — not a learning pair
          .order('confirmed_at', { ascending: false }).limit(10))
      : Promise.resolve([]),
  ]);

  const patient = patientRes?.data || null;

  // Attach teeth to each active plan from the link table.
  let activePlans = plans;
  if (plans.length) {
    const links = await safeRows(supabase.from('treatment_teeth')
      .select('treatment_plan_id, tooth_number')
      .in('treatment_plan_id', plans.map((p) => p.id)));
    const teethByPlan = new Map();
    links.forEach((l) => {
      if (!teethByPlan.has(l.treatment_plan_id)) teethByPlan.set(l.treatment_plan_id, []);
      teethByPlan.get(l.treatment_plan_id).push(l.tooth_number);
    });
    activePlans = plans.map((p) => ({ ...p, teeth: teethByPlan.get(p.id) || [] }));
  }

  return {
    patient: patient ? { ...patient, allergy_list: splitAllergies(patient.allergies) } : null,
    activePlans,
    lastVisit: lastVisitRes?.data || null,
    medicines,
    procedureCatalog,
    fewShots,
  };
}

module.exports = { buildConsultationContext, splitAllergies };
