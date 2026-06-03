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
