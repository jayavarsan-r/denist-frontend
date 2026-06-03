import { apiClient } from '../api/client';

export async function getStaff() {
  const { data } = await apiClient.get('/api/staff');
  return data;
}

export async function getMe() {
  const { data } = await apiClient.get('/api/staff/me');
  return data;
}
