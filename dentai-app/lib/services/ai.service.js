import { apiClient } from '../api/client';

export async function transcribeAudio(audioBlob, filename, recordingType = 'general') {
  const formData = new FormData();
  formData.append('audio', audioBlob, filename || 'recording.webm');
  if (recordingType !== 'general') formData.append('recordingType', recordingType);
  const { data } = await apiClient.post('/api/ai/transcribe', formData);
  return data;
}

export async function generateNote(transcript) {
  const { data } = await apiClient.post('/api/ai/generate-note', { transcript });
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
