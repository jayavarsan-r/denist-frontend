import { apiClient } from '../api/client';

export async function getClinic() {
  const { data } = await apiClient.get('/api/clinic');
  return data;
}

export async function updateClinic(patch) {
  const { data } = await apiClient.patch('/api/clinic', patch);
  return data;
}

// Doctor/owner only — replaces the old GET /me join-code side-effect.
export async function regenerateJoinCode() {
  const { data } = await apiClient.post('/api/clinic/regenerate-join-code');
  return data;
}
