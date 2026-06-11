import { apiClient } from '../api/client';

export async function createTreatmentPlan(planData) {
  const { data } = await apiClient.post('/api/treatment-plans', planData);
  return data;
}

// Clinic-wide plans the patient still owes money on (joined with patient names).
export async function getPendingTreatmentPlans() {
  const { data } = await apiClient.get('/api/treatment-plans', { params: { pending: 1 } });
  return data.plans || data || [];
}

export async function getTreatmentPlan(id) {
  const { data } = await apiClient.get(`/api/treatment-plans/${id}`);
  return data;
}

export async function updateTreatmentPlan(id, patch) {
  const { data } = await apiClient.patch(`/api/treatment-plans/${id}`, patch);
  return data;
}
