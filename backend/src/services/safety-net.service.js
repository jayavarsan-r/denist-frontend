// Deterministic safety checks on the AI extraction — runs after Zod, before the
// draft is saved. Pure function: no DB, no AI. Flags never block the pipeline;
// the Verification Card renders them (high = red + must be acknowledged,
// medium = amber, low = info) and the doctor decides.

function runSafetyChecks(extracted, patientCtx) {
  const flags = [];
  const treatments = extracted?.treatments ?? [];
  const prescriptions = extracted?.prescriptions ?? [];
  // patientCtx.patient.allergy_list is normalised by the context builder
  // (patients.allergies is a free-text column in this DB).
  const allergies = (patientCtx?.patient?.allergy_list ?? [])
    .map((a) => String(a).toLowerCase()).filter(Boolean);

  // Rule 1: drug–allergy conflict (high — must be acknowledged before confirm)
  for (const rx of prescriptions) {
    const span = (rx.medicine_name_span ?? '').toLowerCase();
    for (const allergy of allergies) {
      if (span && (span.includes(allergy) || allergy.includes(span))) {
        flags.push({
          type: 'drug_allergy_conflict',
          severity: 'high',
          field: 'prescriptions',
          message: `"${rx.medicine_name_span}" may conflict with recorded allergy: ${allergy}. Verify before confirming.`,
        });
      }
    }
  }

  // Rules 2+3: prescription missing frequency / duration
  for (const rx of prescriptions) {
    if (!rx.frequency) {
      flags.push({
        type: 'missing_frequency',
        severity: 'medium',
        field: 'prescriptions',
        message: `"${rx.medicine_name_span}" has no frequency (OD/BD/TID…) — add one before confirming.`,
      });
    }
    if (!rx.duration_days) {
      flags.push({
        type: 'missing_duration',
        severity: 'medium',
        field: 'prescriptions',
        message: `"${rx.medicine_name_span}" has no duration — add the number of days.`,
      });
    }
  }

  // Rule 4: procedure spoken but no tooth number
  for (const t of treatments) {
    if (t.procedure_name_span && t.tooth_fdi == null) {
      flags.push({
        type: 'tooth_not_charted',
        severity: 'low',
        field: 'treatments',
        message: `"${t.procedure_name_span}" has no tooth number — add it if applicable.`,
      });
    }
  }

  // Rule 5: ongoing/finished sitting but no follow-up extracted
  const hasOngoingSitting = treatments.some(
    (t) => t.sitting_action === 'completed' || t.sitting_action === 'continued'
  );
  if (hasOngoingSitting && extracted?.follow_up?.in_days == null) {
    flags.push({
      type: 'no_followup_multisitting',
      severity: 'medium',
      field: 'follow_up',
      message: 'A sitting was recorded but no follow-up was extracted — schedule the next visit.',
    });
  }

  // Rule 6: "completed" on a tooth with no matching active plan (reconciliation).
  // Plans carry teeth via treatment_teeth links (string tooth numbers).
  for (const t of treatments) {
    if (t.sitting_action === 'completed' && t.tooth_fdi != null) {
      const spokenProc = (t.procedure_name_span ?? '').toLowerCase().split(' ')[0];
      const match = (patientCtx?.activePlans ?? []).find((plan) => {
        const planProc = (plan.procedure_name ?? '').toLowerCase();
        const teeth = (plan.teeth ?? []).map(String);
        return teeth.includes(String(t.tooth_fdi)) && (!spokenProc || planProc.includes(spokenProc));
      });
      if (!match) {
        flags.push({
          type: 'no_active_plan_for_completion',
          severity: 'low',
          field: 'treatments',
          message: `Tooth ${t.tooth_fdi} marked completed but no matching active plan found — verify.`,
        });
      }
    }
  }

  return flags; // [] = clean, show no warnings
}

module.exports = { runSafetyChecks };
