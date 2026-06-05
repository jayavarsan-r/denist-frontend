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

  const generateFromTranscript = useCallback(async (transcript) => {
    setLoading(true);
    setError(null);
    try {
      const raw = await generateNote(transcript);
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
  const meds = (raw.medications || raw.medicines || []).map((m) => ({
    name: m.name || '',
    dose: m.dose || m.dosage || '',
    frequency: m.frequency || 'OD',
    duration: m.duration || '5 days',
    timing: m.timing || 'After meals',
    instructions: m.instructions || '',
    uncertain: m.uncertain || false,
    slots: m.meal_timing_slots || m.slots || { breakfast: true, lunch: false, dinner: true },
  }));

  const appointments = (raw.follow_up_appointments || raw.appointments || []).map((a, i) => ({
    session: a.session || i + 2,
    date: a.date || '',
    time: a.time || '10:00',
    purpose: a.purpose || `Session ${(a.session || i + 2)}`,
  }));

  return {
    diagnosis: raw.diagnosis || '',
    procedure: raw.procedure_name || raw.procedure || '',
    tooth: raw.tooth_number ? Number(raw.tooth_number) : null,
    totalSittings: raw.total_sittings || 1,
    estimatedCost: raw.cost || raw.estimated_cost || 0,
    medicines: meds,
    instructions: raw.notes || raw.instructions || '',
    followUp: raw.next_steps || raw.follow_up || '',
    appointments,
    // keep raw for backend submission
    _raw: raw,
  };
}
