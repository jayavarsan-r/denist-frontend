import { apiClient } from '../api/client';

export async function getStaff() {
  const { data } = await apiClient.get('/api/staff');
  return data;
}

export async function getMe() {
  const { data } = await apiClient.get('/api/staff/me');
  return data;
}

// Doctor/owner only. patch: { name?, role?, status? }
export async function updateStaff(id, patch) {
  const { data } = await apiClient.patch(`/api/staff/${id}`, patch);
  return data;
}

export async function deactivateStaff(id) {
  const { data } = await apiClient.delete(`/api/staff/${id}`);
  return data;
}
