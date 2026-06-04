import { apiClient } from '../api/client';

export async function uploadXray(file, patientId, xrayType, toothNumber) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('patientId', patientId);
  formData.append('xrayType', xrayType);
  if (toothNumber !== undefined && toothNumber !== null) {
    formData.append('toothNumber', toothNumber);
  }
  const { data } = await apiClient.post('/api/xrays', formData);
  return data;
}

export async function getXrayUrl(id) {
  const { data } = await apiClient.get(`/api/xrays/${id}/url`);
  return data;
}

export async function deleteXray(id) {
  const { data } = await apiClient.delete(`/api/xrays/${id}`);
  return data;
}

export async function getPatientXrays(patientId) {
  const { data } = await apiClient.get(`/api/patients/${patientId}/xrays`);
  return data;
}

export async function uploadPatientPhoto(file, patientId, photoType) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('patientId', patientId);
  formData.append('xrayType', photoType);
  const { data } = await apiClient.post('/api/xrays', formData);
  return data;
}
