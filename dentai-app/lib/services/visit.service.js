import { apiClient } from '../api/client';

export async function listVisits(patientId) {
  const { data } = await apiClient.get('/api/visits', { params: { patientId } });
  return data; // { visits: [...] }
}

export async function createVisit(visitData) {
  const { data } = await apiClient.post('/api/visits', visitData);
  return data;
}
