'use client';
import { useState, useCallback } from 'react';
import { generateNote, extractComplaint } from '@/lib/services/ai.service';

/**
 * useGenerateNote — sends a transcript to the backend to extract a structured clinical note.
 *
 * Returns:
 *   generateFromTranscript(transcript)  → Promise<StructuredNote>
 *   note        object | null
 *   loading     boolean
 *   error       string | null
 *   reset()     void
 *
 * The structured note shape matches the backend response from POST /api/ai/generate-note:
 * {
 *   diagnosis, procedure_name, tooth_number, status,
 *   cost, total_sittings, medications[], follow_up_date,
 *   notes, next_steps
 * }
 *
 * This is mapped to the frontend SAMPLE_EXTRACTION shape:
 * {
 *   diagnosis, procedure, tooth, totalSittings, estimatedCost,
 *   medicines[], instructions, followUp, appointments[]
 * }
 */
export function useGenerateNote() {
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateFromTranscript = useCallback(async (transcript, current) => {
    setLoading(true);
    setError(null);
    try {
      // `current` (optional): the existing structured note (_raw) → merge as a correction.
      const raw = await generateNote(transcript, current);
      const mapped = mapToFrontendShape(raw);
      setNote(mapped);
      setLoading(false);
      return mapped;
    } catch (e) {
      const msg = e?.apiError?.message || e?.message || 'Failed to generate note';
      setError(msg);
      setLoading(false);
      throw new Error(msg);
    }
  }, []);

  const reset = useCallback(() => {
    setNote(null);
    setError(null);
    setLoading(false);
  }, []);

  return { generateFromTranscript, note, loading, error, reset };
}

/**
 * useExtractComplaint — extracts a chief complaint from a transcript.
 */
export function useExtractComplaint() {
  const [complaint, setComplaint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const extract = useCallback(async (transcript) => {
    setLoading(true);
    setError(null);
    try {
      const data = await extractComplaint(transcript);
      // Backend returns { complaint } (not chiefComplaint)
      const text = data.complaint || data.chiefComplaint || data.chief_complaint || transcript;
      setComplaint(text);
      setLoading(false);
      return text;
    } catch (e) {
      const msg = e?.apiError?.message || e?.message || 'Extraction failed';
      setError(msg);
      setLoading(false);
      // Fall back to raw transcript
      setComplaint(transcript);
      return transcript;
    }
  }, []);

  return { extract, complaint, loading, error };
}

/* ─── Map backend structured note → frontend shape ─── */
function mapToFrontendShape(raw) {
  // Backend wraps the note as { structured: {...} } and the Gemini schema uses
  // camelCase (toothNumber, totalSittings, notes) with no explicit "diagnosis"
  // field. Unwrap, and read both camelCase and snake_case so nothing maps to empty.
  const n = (raw && raw.structured) ? raw.structured : (raw || {});

  // In the consultation schema `medications` is a STRING (or null); only the
  // prescription schema returns an array. Guard so .map never runs on a string.
  const medsRaw = n.medications || n.medicines;
  const meds = (Array.isArray(medsRaw) ? medsRaw : []).map((m) => ({
    name: m.name || '',
    dose: m.dose || m.dosage || '',
    frequency: m.frequency || 'OD',
    duration: m.duration || '5 days',
    timing: m.timing || 'After meals',
    instructions: m.instructions || '',
    uncertain: m.uncertain || false,
    slots: m.meal_timing_slots || m.slots || { breakfast: true, lunch: false, dinner: true },
  }));

  // Gemini's consultation schema returns `followUpAppointments` (camelCase) — the smart
  // array that resolves "come back Thursday" / "review in 3 months" / "4 sittings" into
  // concrete dated visits. Read that FIRST (the snake_case/`appointments` fallbacks were
  // the only keys read before, so every AI-recommended appointment was being dropped).
  const appointments = (n.followUpAppointments || n.follow_up_appointments || n.appointments || []).map((a, i) => ({
    session: a.session || i + 2,
    date: a.date || '',
    time: a.time || '10:00',
    purpose: a.purpose || `Session ${(a.session || i + 2)}`,
  }));

  const tooth = n.toothNumber ?? n.tooth_number;
  // All teeth covered by this procedure (multi-tooth); fall back to the primary tooth.
  const teethRaw = Array.isArray(n.toothNumbers) ? n.toothNumbers
    : Array.isArray(n.tooth_numbers) ? n.tooth_numbers : [];
  const teeth = [...new Set(
    [...teethRaw, tooth].filter((t) => t != null && String(t).trim() !== '').map((t) => String(t).trim())
  )];

  return {
    diagnosis: n.diagnosis || n.notes || '',
    procedure: n.procedure || n.procedure_name || '',
    tooth: tooth ? Number(tooth) : null,
    teeth,
    totalSittings: n.totalSittings || n.total_sittings || 1,
    estimatedCost: n.cost || n.estimated_cost || 0,
    medicines: meds,
    instructions: n.instructions || '',
    followUp: n.followUpDate || n.follow_up_date || n.nextSteps || n.next_steps || '',
    appointments,
    // keep the structured note for backend submission
    _raw: n,
  };
}
