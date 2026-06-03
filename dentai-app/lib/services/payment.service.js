import { apiClient } from '../api/client';

export async function recordPayment(paymentData) {
  const { data } = await apiClient.post('/api/payments', paymentData);
  return data;
}

export async function getPatientPayments(patientId) {
  const { data } = await apiClient.get(`/api/payments/patient/${patientId}`);
  return data;
}

export async function getPlanPayments(planId) {
  const { data } = await apiClient.get(`/api/payments/plan/${planId}`);
  return data;
}
