import { apiClient } from '../api/client';

export async function transcribeAudio(audioBlob, filename, recordingType = 'general') {
  const formData = new FormData();
  formData.append('audio', audioBlob, filename || 'recording.webm');
  if (recordingType !== 'general') formData.append('recordingType', recordingType);
  const { data } = await apiClient.post('/api/ai/transcribe', formData);
  return data;
}

// ── Async voice pipeline (Phase 2) ──────────────────────────────────────────
// The consult voice flow no longer calls transcribe/generate-note synchronously:
// audio goes to start-voice, the backend worker fills a consultation_draft, and
// the Verification Card subscribes to that draft row.

// Profile consult (no queue entry) — returns { draft_id, job_id }.
export async function startPatientVoice(patientId, audioBlob, filename = 'recording.webm') {
  const formData = new FormData();
  formData.append('audio', audioBlob, filename);
  const { data } = await apiClient.post(`/api/patients/${patientId}/start-voice`, formData);
  return data;
}

// Polling fallback + initial fetch for the Verification Card.
export async function getDraft(draftId) {
  const { data } = await apiClient.get(`/api/consultation-drafts/${draftId}`);
  return data.draft || data;
}

// Lightweight review for non-queue drafts (profile consult confirm + reject).
export async function reviewDraft(draftId, { status, confirmedData }) {
  const { data } = await apiClient.patch(`/api/consultation-drafts/${draftId}`, {
    status,
    confirmed_data: confirmedData ?? null,
  });
  return data;
}

export async function extractComplaint(transcript) {
  const { data } = await apiClient.post('/api/ai/extract-complaint', { transcript });
  return data;
}

export async function extractPrescription(transcript) {
  const { data } = await apiClient.post('/api/ai/extract-prescription', { transcript });
  return data;
}

export async function extractPatientInfo(transcript) {
  const { data } = await apiClient.post('/api/ai/extract-patient-info', { transcript });
  return data;
}

// Inventory voice — transcript → parsed inventory command (intent + resolved items
// + deterministic answer). The interceptor unwraps the { success, data } envelope.
export async function extractInventoryCommand(transcript) {
  const { data } = await apiClient.post('/api/ai/extract-inventory', { transcript });
  return data;
}

// Scheduling INTENT only — { patient, procedure, preferredDate, preferredTime, notes }.
// The deterministic slot finder + the doctor's confirmation do the actual scheduling.
export async function parseScheduleIntent(transcript) {
  const { data } = await apiClient.post('/api/ai/parse-schedule', { transcript });
  return data.intent || data;
}
