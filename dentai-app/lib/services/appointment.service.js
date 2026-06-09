import { apiClient } from '../api/client';

function normaliseForApi(data) {
  return {
    patientId:       data.patientId    || data.patient_id,
    appointmentDate: data.appointmentDate || data.appointment_date || data.date,
    appointmentTime: data.appointmentTime || data.appointment_time || data.startTime,
    purpose:         data.purpose || data.type || data.procedureName || data.procedure || '',
    toothNumber:     data.toothNumber || data.tooth_number || data.tooth || null,
    durationMinutes: data.durationMinutes || data.duration_minutes || undefined,
    status:          data.status || undefined,
  };
}

export async function listAppointments(date) {
  const params = {};
  if (date) params.date = date;
  const { data } = await apiClient.get('/api/appointments', { params });
  return data;
}

export async function getTodayAppointments() {
  const { data } = await apiClient.get('/api/appointments/today');
  return data;
}

export async function getUpcomingAppointments() {
  const { data } = await apiClient.get('/api/appointments/upcoming');
  return data;
}

export async function getBookedSlots(date) {
  const params = {};
  if (date) params.date = date;
  const { data } = await apiClient.get('/api/appointments/booked-slots', { params });
  return data;
}

export async function createAppointment(appointmentData) {
  const { data } = await apiClient.post('/api/appointments', normaliseForApi(appointmentData));
  return data;
}

export async function updateAppointment(id, patch) {
  // Only include fields that are actually present in the patch
  const normalised = normaliseForApi(patch);
  const payload = {};
  Object.keys(normalised).forEach((k) => {
    if (normalised[k] !== undefined) payload[k] = normalised[k];
  });
  const { data } = await apiClient.put(`/api/appointments/${id}`, payload);
  return data;
}
