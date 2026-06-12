import { apiClient } from '../api/client';

export async function getClinic() {
  const { data } = await apiClient.get('/api/clinic');
  return data;
}

export async function updateClinic(patch) {
  const { data } = await apiClient.patch('/api/clinic', patch);
  return data;
}

// Upload the clinic logo (PNG/JPEG). Backend stores the path and returns a preview URL.
export async function uploadClinicLogo(file) {
  const fd = new FormData();
  fd.append('logo', file);
  const { data } = await apiClient.post('/api/clinic/logo', fd);
  return data; // { logoPath, logoUrl }
}

// Doctor-only clinic preferences (jsonb), e.g. { receptionistCanAddMedicines: true }.
export async function updateClinicSettings(patch) {
  const { data } = await apiClient.patch('/api/clinic/settings', patch);
  return data;
}

// Doctor/owner only — replaces the old GET /me join-code side-effect.
export async function regenerateJoinCode() {
  const { data } = await apiClient.post('/api/clinic/regenerate-join-code');
  return data;
}
