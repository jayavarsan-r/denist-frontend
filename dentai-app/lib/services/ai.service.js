import { apiClient } from '../api/client';

export async function transcribeAudio(audioBlob, filename, recordingType = 'general') {
  const formData = new FormData();
  formData.append('audio', audioBlob, filename || 'recording.webm');
  if (recordingType !== 'general') formData.append('recordingType', recordingType);
  const { data } = await apiClient.post('/api/ai/transcribe', formData);
  return data;
}

export async function generateNote(transcript, current) {
  // `current` (optional): existing structured note → backend merges transcript as a correction.
  const { data } = await apiClient.post('/api/ai/generate-note', current ? { transcript, current } : { transcript });
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

// Scheduling INTENT only — { patient, procedure, preferredDate, preferredTime, notes }.
// The deterministic slot finder + the doctor's confirmation do the actual scheduling.
export async function parseScheduleIntent(transcript) {
  const { data } = await apiClient.post('/api/ai/parse-schedule', { transcript });
  return data.intent || data;
}
