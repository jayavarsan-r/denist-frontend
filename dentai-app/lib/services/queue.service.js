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

export async function completeConsult(id, consultData) {
  const { data } = await apiClient.post(`/api/queue/${id}/complete-consult`, consultData);
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
