import { apiClient } from '../api/client';

/** Normalise a snake_case lab_orders row → the camelCase shape the UI expects. */
export function normLab(r) {
  if (!r) return r;
  return {
    id: r.id,
    patientId: r.patient_id,
    patientName: r.patients?.name || r.patient_name || r.patientName || '',
    treatmentPlanId: r.treatment_plan_id ?? null,
    procedureType: r.procedure_type || '',
    toothNumber: r.tooth_number ?? null,
    labName: r.lab_name || '',
    workDescription: r.work_description || '',
    shade: r.shade || '',
    impressionType: r.impression_type || '',
    sentDate: r.sent_date || null,
    expectedReturnDate: r.expected_return_date || null,
    actualReturnDate: r.actual_return_date || null,
    status: r.status || 'pending',
    costToClinic: r.cost_to_clinic != null ? Number(r.cost_to_clinic) : 0,
    chargedToPatient: r.charged_to_patient != null ? Number(r.charged_to_patient) : 0,
    reportUrl: r.report_url || null,
    notes: r.notes || '',
    createdAt: r.created_at || null,
  };
}

// Clinic-wide list (finance/lab screen). Optional status filter.
export async function getLabOrders(status) {
  const { data } = await apiClient.get('/api/lab-orders', { params: status ? { status } : {} });
  return (data.labOrders || data || []).map(normLab);
}

export async function getPatientLabOrders(patientId) {
  const { data } = await apiClient.get(`/api/patients/${patientId}/lab-orders`);
  return (data.labOrders || data || []).map(normLab);
}

export async function createLabOrder(body) {
  const { data } = await apiClient.post('/api/lab-orders', body);
  return normLab(data.labOrder || data);
}

export async function updateLabOrder(id, patch) {
  const { data } = await apiClient.patch(`/api/lab-orders/${id}`, patch);
  return normLab(data.labOrder || data);
}

export async function deleteLabOrder(id) {
  await apiClient.delete(`/api/lab-orders/${id}`);
  return true;
}
