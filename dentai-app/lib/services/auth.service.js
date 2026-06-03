import { apiClient, setToken, clearToken } from '../api/client';

export async function sendOtp(phone) {
  const { data } = await apiClient.post('/api/auth/send-otp', { phone });
  return data;
}

export async function verifyOtp(phone, code) {
  // Backend expects field name "otp", not "code"
  const { data } = await apiClient.post('/api/auth/verify-otp', { phone, otp: code });
  if (data.token) {
    setToken(data.token);
  }
  return data;
}

export async function getMe() {
  const { data } = await apiClient.get('/api/auth/me');
  return data;
}

export async function createClinic(clinicName, city, yourName) {
  // Backend expects: { clinicName, yourName, city }
  const { data } = await apiClient.post('/api/auth/create-clinic', { clinicName, yourName: yourName || clinicName, city });
  if (data.token) setToken(data.token);
  return data;
}

export async function lookupClinic(joinCode) {
  const { data } = await apiClient.post('/api/auth/lookup-clinic', { joinCode });
  return data;
}

export async function joinClinic(joinCode, role, yourName) {
  // Backend expects: { joinCode, yourName, role }
  const { data } = await apiClient.post('/api/auth/join-clinic', { joinCode, role, yourName: yourName || role });
  if (data.token) setToken(data.token);
  return data;
}

export async function updateProfile(fields) {
  const { data } = await apiClient.put('/api/auth/profile', fields);
  return data;
}

export function logout() {
  clearToken();
}
