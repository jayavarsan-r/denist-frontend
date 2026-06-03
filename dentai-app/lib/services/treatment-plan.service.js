import { apiClient } from '../api/client';

export async function createTreatmentPlan(planData) {
  const { data } = await apiClient.post('/api/treatment-plans', planData);
  return data;
}

export async function getTreatmentPlan(id) {
  const { data } = await apiClient.get(`/api/treatment-plans/${id}`);
  return data;
}

export async function updateTreatmentPlan(id, patch) {
  const { data } = await apiClient.patch(`/api/treatment-plans/${id}`, patch);
  return data;
}
