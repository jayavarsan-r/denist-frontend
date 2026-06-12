import { apiClient } from '../api/client';

export async function getQueue() {
  const { data } = await apiClient.get('/api/queue');
  return data;
}

export async function addToQueue(queueData) {
  const { data } = await apiClient.post('/api/queue', queueData);
  return data;
}

export async function updateQueueEntry(id, patch) {
  const { data } = await apiClient.patch(`/api/queue/${id}`, patch);
  return data;
}

// Async voice pipeline intake — multipart audio; returns { draft_id, job_id }.
export async function startVoice(id, audioBlob, filename = 'recording.webm') {
  const formData = new FormData();
  formData.append('audio', audioBlob, filename);
  const { data } = await apiClient.post(`/api/queue/${id}/start-voice`, formData);
  return data;
}

// Manual ("type notes") entry: an empty draft so hand-typed consults pass
// through the same confirm gate as voice ones. Returns { draft_id }.
export async function startManualDraft(id) {
  const { data } = await apiClient.post(`/api/queue/${id}/manual-draft`);
  return data;
}

// Phase 2: confirms an AI draft from the Verification Card.
// Body: { draft_id, confirmed_data }.
export async function completeConsult(id, { draftId, confirmedData }) {
  const { data } = await apiClient.post(`/api/queue/${id}/complete-consult`, {
    draft_id: draftId,
    confirmed_data: confirmedData,
  });
  return data;
}

export async function getQueueContext(id) {
  const { data } = await apiClient.get(`/api/queue/${id}/context`);
  return data;
}

// Persisted consultation data for the checkout screen (works across users/sessions).
export async function getCheckoutSummary(id) {
  const { data } = await apiClient.get(`/api/queue/${id}/checkout-summary`);
  return data.summary || data;
}

export async function removeFromQueue(id) {
  const { data } = await apiClient.delete(`/api/queue/${id}`);
  return data;
}

export async function reorderQueue(id, direction) {
  const { data } = await apiClient.patch(`/api/queue/${id}/reorder`, { direction });
  return data;
}
