import { apiClient } from '../api/client';

export async function getClinic() {
  const { data } = await apiClient.get('/api/clinic');
  return data;
}

export async function updateClinic(patch) {
  const { data } = await apiClient.patch('/api/clinic', patch);
  return data;
}
