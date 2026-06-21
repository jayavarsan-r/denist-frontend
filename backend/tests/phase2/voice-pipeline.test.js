// Integration test for the voice worker — every external boundary mocked:
// Sarvam, Gemini extraction, context builder, and the supabase client.

jest.mock('../../src/config/supabase', () => {
  const { makeSupabaseMock } = require('./helpers/supabase-mock');
  return makeSupabaseMock((table, calls) => global.__sbResolver(table, calls));
});
jest.mock('../../src/services/ai/providers/sarvam.provider', () => ({
  transcribe: jest.fn(),
  hasKey: () => true,
}));
jest.mock('../../src/services/consultation-context.service', () => ({
  buildConsultationContext: jest.fn(),
}));
jest.mock('../../src/services/gemini-extraction.service', () => ({
  extractFromTranscript: jest.fn(),
  applyCostFallback: jest.fn((extracted) => extracted),
}));

const sb = require('../../src/config/supabase');
const sarvam = require('../../src/services/ai/providers/sarvam.provider');
const { buildConsultationContext } = require('../../src/services/consultation-context.service');
const { extractFromTranscript } = require('../../src/services/gemini-extraction.service');
const { handleVoiceJob } = require('../../src/workers/voice.worker');
const { AppError } = require('../../src/utils/errors');

const JOB = {
  draftId: 'D1', clinicId: 'C1', patientId: 'P1', queueEntryId: 'Q1',
  doctorId: 'S1', dentistId: 'DEN1', audioPath: 'audio/C1/Q1/123.webm',
};

const EXTRACTED = {
  treatments: [{ procedure_name_span: 'root canal', procedure_code: 'RCT', tooth_fdi: 36, sitting_action: 'started', sitting_number: 1, notes: null }],
  prescriptions: [{ medicine_name_span: 'amoxicillin 500', dose: '500mg', frequency: null, duration_days: 5, instructions: null }],
  follow_up: { in_days: 7, reason: 'sitting 2' },
  lab_case_suggestion: null,
  clinical_notes: 'RCT started on 36',
  unclear_spans: [],
};

const CTX = { patient: { name: 'Asha', allergy_list: [] }, activePlans: [], lastVisit: null, medicines: [], procedureCatalog: [], fewShots: [] };

function draftsUpdates() {
  return sb._queries
    .filter((q) => q.table === 'consultation_drafts' && q.calls.some(([m]) => m === 'update'))
    .map((q) => q.calls.find(([m]) => m === 'update')[1]);
}

describe('voice worker pipeline', () => {
  beforeEach(() => {
    sb._queries.length = 0;
    global.__sbResolver = () => ({ data: null, error: null });
    sarvam.transcribe.mockReset();
    buildConsultationContext.mockReset();
    extractFromTranscript.mockReset();
  });

  test('happy path: draft filled, flags computed, queue entry → draft_ready', async () => {
    sarvam.transcribe.mockResolvedValue({ transcript: 'deep caries 36, started root canal, amoxicillin five days' });
    buildConsultationContext.mockResolvedValue(CTX);
    extractFromTranscript.mockResolvedValue({ data: EXTRACTED, lowConfidence: [], droppedCount: 0, salvageUsed: false, raw: { mocked: true }, telemetry: {} });
    global.__sbResolver = (table) => {
      if (table === 'inventory_items') return { data: [], error: null }; // no match yet (Phase 3)
      // The status-guarded persist (.eq status 'processing' .select .maybeSingle)
      // must return the row so the worker proceeds past the idempotency guard.
      if (table === 'consultation_drafts') return { data: { id: 'D1' }, error: null };
      return { data: null, error: null };
    };

    await handleVoiceJob(JOB);

    const updates = draftsUpdates();
    const final = updates[updates.length - 1];
    expect(final.status).toBe('pending_review');
    expect(final.extracted.treatments[0].tooth_fdi).toBe(36);
    // medicine resolution attached, honest about not matching inventory
    expect(final.extracted.prescriptions[0].resolution_confident).toBe(false);
    expect(final.extracted.prescriptions[0].resolved_name).toBe('amoxicillin 500');
    // safety net ran: missing frequency flag present
    expect(final.safety_flags.some((f) => f.type === 'missing_frequency')).toBe(true);

    const queueUpdate = sb._queries.find((q) => q.table === 'queue_entries');
    expect(queueUpdate.calls.find(([m]) => m === 'update')[1]).toMatchObject({ status: 'draft_ready', draft_id: 'D1' });

    // audio came from storage
    expect(sb._storageDownloads).toEqual([{ bucket: 'voice-notes', path: JOB.audioPath }]);
  });

  test('STT failure: draft → error with code, queue entry → voice_error, job rethrows', async () => {
    sarvam.transcribe.mockRejectedValue(new AppError('STT_UNAVAILABLE', 'Sarvam down'));

    await expect(handleVoiceJob(JOB)).rejects.toMatchObject({ code: 'STT_UNAVAILABLE' });

    const updates = draftsUpdates();
    const final = updates[updates.length - 1];
    expect(final.status).toBe('error');
    expect(final.error_code).toBe('STT_UNAVAILABLE');

    const queueUpdate = sb._queries.find((q) => q.table === 'queue_entries');
    expect(queueUpdate.calls.find(([m]) => m === 'update')[1].status).toBe('voice_error');
  });

  test('profile consult (no queueEntryId): no queue_entries write at all', async () => {
    sarvam.transcribe.mockResolvedValue({ transcript: 'scaling done' });
    buildConsultationContext.mockResolvedValue(CTX);
    extractFromTranscript.mockResolvedValue({ data: { ...EXTRACTED, prescriptions: [] }, lowConfidence: [], droppedCount: 0, salvageUsed: false, raw: {}, telemetry: {} });
    global.__sbResolver = (table) => (table === 'consultation_drafts' ? { data: { id: 'D1' }, error: null } : { data: null, error: null });

    await handleVoiceJob({ ...JOB, queueEntryId: null });

    expect(sb._queries.find((q) => q.table === 'queue_entries')).toBeUndefined();
    const updates = draftsUpdates();
    expect(updates[updates.length - 1].status).toBe('pending_review');
  });

  test('empty transcript is an error, not a silent empty draft', async () => {
    sarvam.transcribe.mockResolvedValue({ transcript: '   ' });
    await expect(handleVoiceJob(JOB)).rejects.toMatchObject({ code: 'STT_EMPTY' });
    const updates = draftsUpdates();
    expect(updates[updates.length - 1].error_code).toBe('STT_EMPTY');
  });
});
