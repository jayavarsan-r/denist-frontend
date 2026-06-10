import { apiClient } from '../api/client';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function createPrescription(prescriptionData) {
  const { data } = await apiClient.post('/api/prescriptions', prescriptionData);
  return data;
}

export async function getPrescription(id) {
  const { data } = await apiClient.get(`/api/prescriptions/${id}`);
  return data;
}

export function getPrescriptionPdfUrl(id) {
  return `${BASE_URL}/api/prescriptions/${id}/pdf`;
}

// The PDF route requires auth, so a plain window.open(url) gets a 401 (no token on a
// top-level navigation). Fetch it through apiClient (which adds the Bearer header) as a
// blob the caller can open or share.
export async function fetchPrescriptionPdfBlob(id) {
  const res = await apiClient.get(`/api/prescriptions/${id}/pdf`, { responseType: 'blob' });
  return res.data; // Blob
}
