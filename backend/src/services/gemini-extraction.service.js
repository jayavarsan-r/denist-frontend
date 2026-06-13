const { z } = require('zod');
const gemini = require('./ai/providers/gemini.provider');
const { AppError } = require('../utils/errors');

// ── Zod schema for the structured intent object ─────────────────────────────

// Valid FDI: quadrant 1-4 + tooth 1-8 (11-18, 21-28, 31-38, 41-48).
const fdi = z.number().int().min(11).max(48)
  .refine((n) => n % 10 >= 1 && n % 10 <= 8, 'invalid FDI tooth number');

const TreatmentSchema = z.object({
  procedure_name_span: z.string().nullable().default(null),
  procedure_code:      z.string().nullable().default(null),
  tooth_fdi:           fdi.nullable().default(null),
  sitting_action:      z.enum(['completed', 'started', 'continued']).nullable().default(null),
  sitting_number:      z.number().int().positive().nullable().default(null),
  notes:               z.string().nullable().default(null),
});

const PrescriptionSchema = z.object({
  medicine_name_span: z.string(),
  dose:               z.string().nullable().default(null),
  frequency:          z.enum(['OD', 'BD', 'TID', 'QID', 'SOS']).nullable().default(null),
  duration_days:      z.number().int().positive().nullable().default(null),
  instructions:       z.string().nullable().default(null),
});

const DraftSchema = z.object({
  treatments:    z.array(TreatmentSchema).default([]),
  prescriptions: z.array(PrescriptionSchema).default([]),
  follow_up: z.object({
    in_days: z.number().int().positive().nullable().default(null),
    reason:  z.string().nullable().default(null),
  }).nullable().default(null),
  lab_case_suggestion: z.object({
    type: z.enum(['crown_pfm', 'crown_zirconia', 'bridge', 'denture_full', 'denture_partial', 'aligner', 'inlay_onlay', 'other']).nullable().default(null),
    tooth_fdi:   fdi.nullable().default(null),
    due_in_days: z.number().int().positive().nullable().default(null),
  }).nullable().default(null),
  clinical_notes: z.string().nullable().default(null),
  unclear_spans:  z.array(z.string()).default([]),
});

// ── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM = `You are a dental documentation assistant at an Indian dental clinic. Extract structured data from the dentist's voice note.

The dentist may speak in ANY language — Tamil, Hindi, Telugu, Malayalam, Kannada, English, or any mix. Translate clinical content into clear professional English in your output.

RULES — follow exactly:
1. Your ONLY job is extraction. Never add clinical information not spoken by the dentist. You do NOT diagnose or recommend treatments.
2. If unsure about any field, return null — do not guess. null is correct; hallucination is wrong.
3. tooth_fdi must be a valid FDI number 11–48 (quadrant digit 1-4, tooth digit 1-8). Convert spoken/Universal numbering to FDI. "upper right molar" with no number → null.
4. For medicines: copy the exact spoken words into medicine_name_span. Do NOT resolve to a canonical name — the code does that.
5. For procedures: match procedure_code from the clinic catalog when confident; otherwise leave it null and keep the spoken words in procedure_name_span.
6. follow_up.in_days: number of days until the dentist wants the patient back ("review next week" → 7). null if no follow-up was asked for.
7. unclear_spans: list anything the doctor said that you could not confidently parse.
8. Return ONLY valid JSON matching the schema below. No markdown fences, no explanation.

OUTPUT SCHEMA:
{
  "treatments": [{ "procedure_name_span": "exact words spoken", "procedure_code": "catalog code or null", "tooth_fdi": number_or_null, "sitting_action": "completed|started|continued|null", "sitting_number": number_or_null, "notes": "string or null" }],
  "prescriptions": [{ "medicine_name_span": "exact words spoken", "dose": "string or null", "frequency": "OD|BD|TID|QID|SOS|null", "duration_days": number_or_null, "instructions": "string or null" }],
  "follow_up": { "in_days": number_or_null, "reason": "string or null" },
  "lab_case_suggestion": { "type": "crown_pfm|crown_zirconia|bridge|denture_full|denture_partial|aligner|inlay_onlay|other|null", "tooth_fdi": number_or_null, "due_in_days": number_or_null },
  "clinical_notes": "verbatim English summary of what was done, or null",
  "unclear_spans": ["..."]
}`;

function buildPrompt(transcript, ctx) {
  const medicineList = ctx.medicines?.length
    ? ctx.medicines.map((m) => `  • ${m.name}${m.strength ? ' ' + m.strength : ''} — ₹${m.price_per_unit ?? '?'}/${m.unit ?? 'unit'}`).join('\n')
    : '  (no medicine list configured — keep exact spoken names)';

  const procedureList = ctx.procedureCatalog?.length
    ? ctx.procedureCatalog.map((p) => `  • ${p.name} [${p.code}] — ${p.default_sittings} sitting(s), ₹${p.default_fee ?? '?'}`).join('\n')
    : '  (no procedure catalog configured)';

  const activePlanList = ctx.activePlans?.length
    ? ctx.activePlans.map((p) => `  • ${p.procedure_name}, teeth ${p.teeth?.length ? p.teeth.join(',') : '?'}, sitting ${p.completed_sittings}/${p.total_sittings}, status: ${p.status}`).join('\n')
    : '  none';

  const fewShotBlock = ctx.fewShots?.length
    ? ctx.fewShots.map((f) => `  Voice: "${(f.raw_transcript || '').slice(0, 300)}"\n  Corrections the doctor made: ${JSON.stringify(f.corrections)}`).join('\n\n')
    : '  none yet';

  const lastVisitBlock = ctx.lastVisit
    ? `${ctx.lastVisit.visit_date} — ${ctx.lastVisit.procedure_name || ''}${ctx.lastVisit.tooth_number ? ' (tooth ' + ctx.lastVisit.tooth_number + ')' : ''}: ${(ctx.lastVisit.notes || '').slice(0, 300) || 'no notes'}`
    : 'first visit';

  const patient = ctx.patient || {};
  return `PATIENT:
  Name: ${patient.name ?? 'unknown'}, Age: ${patient.age ?? '?'}, Gender: ${patient.gender ?? '?'}
  Allergies: ${patient.allergy_list?.length ? patient.allergy_list.join(', ') : 'none recorded'}
  Medical conditions: ${patient.medical_conditions || 'none'}
  Clinical flags: ${patient.clinical_flags || 'none'}

ACTIVE TREATMENT PLANS:
${activePlanList}

LAST VISIT: ${lastVisitBlock}

CLINIC MEDICINE LIST (resolve medicine names from this list only — keep spoken words in medicine_name_span):
${medicineList}

CLINIC PROCEDURE CATALOG (match procedure_code from this list):
${procedureList}

DOCTOR'S PAST CORRECTIONS (learn from these — they show how this doctor speaks and what was previously extracted wrong):
${fewShotBlock}

TRANSCRIPT TO EXTRACT:
"${transcript}"`;
}

// ── Main extraction ──────────────────────────────────────────────────────────
// Returns { data, lowConfidence, raw }:
//   data          — schema-shaped object (full parse, or per-section salvage)
//   lowConfidence — field paths that failed validation → amber on the card
//   raw           — Gemini's parsed JSON before validation (audit trail)
// Throws typed AppErrors (LLM_UNAVAILABLE 503 / EXTRACTION_FAILED 422) from the
// provider for real failures.
async function extractFromTranscript(transcript, ctx) {
  // gemini.generate handles key rotation, JSON mode, fence-stripping and throws
  // LLM_UNAVAILABLE / EXTRACTION_FAILED / AI_TIMEOUT — exactly what the worker needs.
  const parsed = await gemini.generate(SYSTEM, buildPrompt(transcript, ctx), {
    temperature: 0,
    maxOutputTokens: 2048,
  });

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AppError('EXTRACTION_FAILED', 'AI returned a non-object payload', { raw: JSON.stringify(parsed).slice(0, 2000) });
  }

  const result = DraftSchema.safeParse(parsed);
  if (result.success) return { data: result.data, lowConfidence: [], raw: parsed };

  // Partial salvage: drop the array entries / sections that failed, keep the rest,
  // and report the failing paths so the Verification Card can mark them amber.
  const lowConfidence = result.error.issues.map((i) => i.path.join('.') || '(root)');
  const salvage = DraftSchema.parse({
    treatments:    salvageArray(parsed.treatments, TreatmentSchema),
    prescriptions: salvageArray(parsed.prescriptions, PrescriptionSchema),
    follow_up:     salvageObject(parsed.follow_up, DraftSchema.shape.follow_up),
    lab_case_suggestion: salvageObject(parsed.lab_case_suggestion, DraftSchema.shape.lab_case_suggestion),
    clinical_notes: typeof parsed.clinical_notes === 'string' ? parsed.clinical_notes : null,
    unclear_spans:  Array.isArray(parsed.unclear_spans) ? parsed.unclear_spans.filter((s) => typeof s === 'string') : [],
  });
  return { data: salvage, lowConfidence, raw: parsed };
}

function salvageArray(value, itemSchema) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => itemSchema.safeParse(item)).filter((r) => r.success).map((r) => r.data);
}

function salvageObject(value, schema) {
  const r = schema.safeParse(value);
  return r.success ? r.data : null;
}

module.exports = { extractFromTranscript, DraftSchema, buildPrompt, SYSTEM };
