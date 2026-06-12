import { create } from 'zustand';
import {
  listAppointments,
  getTodayAppointments,
  createAppointment,
  updateAppointment as apiUpdateAppointment,
} from '@/lib/services/appointment.service';
import { listVisits } from '@/lib/services/visit.service';

function normaliseClinicalVisit(raw) {
  return {
    id: raw.id,
    type: 'consultation',
    patientId: raw.patient_id,
    dentistId: raw.dentist_id,
    date: raw.visit_date || raw.created_at?.slice(0, 10) || '',
    procedureName: raw.procedure_name || '',
    toothNumber: raw.tooth_number || null,
    status: raw.status || 'completed',
    notes: raw.notes || '',
    medications: raw.medications || [],
    nextSteps: raw.next_steps || '',
    followUpDate: raw.follow_up_date || null,
    rawTranscript: raw.raw_transcript || '',
    cost: raw.cost || null,
    currency: raw.currency || 'INR',
    createdAt: raw.created_at || null,
  };
}

function normaliseAppointment(raw) {
  // Strip trailing seconds from time strings like "09:00:00" → "09:00"
  const startTime = raw.appointment_time
    ? raw.appointment_time.slice(0, 5)
    : '';

  return {
    id: raw.id,
    patientId: raw.patient_id ?? null,
    // The backend list joins `patients(id, name, phone)`. Carry that through so the
    // schedule can show the real name even when the patient isn't in the (possibly
    // partial) patients store — otherwise the row falls back to the literal "Patient".
    patientName: raw.patients?.name ?? raw.patient_name ?? null,
    patientPhone: raw.patients?.phone ?? raw.patient_phone ?? null,
    dentistId: raw.dentist_id ?? null,
    clinicId: raw.clinic_id ?? null,
    date: raw.appointment_date ?? '',
    startTime,
    purpose: raw.purpose ?? '',
    procedureId: raw.purpose ?? null,
    tooth: raw.tooth_number ?? null,
    status: raw.status ?? 'scheduled',
    durationMinutes: raw.duration_minutes ?? 30,
    visitNumber: raw.visit_number ?? 1,
    totalVisits: raw.total_visits ?? 1,
  };
}

export const useVisitStore = create((set) => ({
  visits: [],
  clinicalVisits: [],
  loading: false,
  error: null,

  loadClinicalVisits: async () => {
    try {
      const raw = await listVisits();
      const list = raw?.visits || (Array.isArray(raw) ? raw : []);
      set({ clinicalVisits: list.map(normaliseClinicalVisit) });
    } catch (err) {
      console.warn('[VisitStore] loadClinicalVisits failed', err?.message);
    }
  },

  loadAppointments: async (date) => {
    set({ loading: true, error: null });
    try {
      const raw = await listAppointments(date);
      const list = raw?.appointments || raw?.data || (Array.isArray(raw) ? raw : []);
      const visits = list.map(normaliseAppointment);
      set({ visits, loading: false });
    } catch (err) {
      set({ error: err?.message ?? 'Failed to load appointments', loading: false });
    }
  },

  loadTodayAppointments: async () => {
    set({ loading: true, error: null });
    try {
      const raw = await getTodayAppointments();
      const list = raw?.appointments || raw?.data || (Array.isArray(raw) ? raw : []);
      const visits = list.map(normaliseAppointment);
      set({ visits, loading: false });
    } catch (err) {
      set({ error: err?.message ?? "Failed to load today's appointments", loading: false });
    }
  },

  addVisit: async (data) => {
    set({ loading: true, error: null });
    try {
      const raw = await createAppointment(data);
      // backend returns { appointment: {...} }
      const record = raw?.appointment || raw;
      const visit = normaliseAppointment(record);
      set((s) => ({ visits: [...s.visits, visit], loading: false }));
      return visit;
    } catch (err) {
      set({ error: err?.message ?? 'Failed to create appointment', loading: false });
      throw err;
    }
  },

  updateVisit: async (id, patch) => {
    // Optimistic update
    set((s) => ({
      visits: s.visits.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));
    try {
      const raw = await apiUpdateAppointment(id, patch);
      // backend returns { appointment: {...} }
      const record = raw?.appointment || raw;
      const updated = normaliseAppointment(record);
      set((s) => ({
        visits: s.visits.map((v) => (v.id === id ? updated : v)),
      }));
    } catch (err) {
      set({ error: err?.message ?? 'Failed to update appointment' });
      throw err;
    }
  },

  moveVisit: async (id, date, startTime) => {
    // Optimistic update
    set((s) => ({
      visits: s.visits.map((v) => (v.id === id ? { ...v, date, startTime } : v)),
    }));
    try {
      const raw = await apiUpdateAppointment(id, {
        appointment_date: date,
        appointment_time: startTime,
      });
      const record = raw?.appointment || raw;
      const updated = normaliseAppointment(record);
      set((s) => ({
        visits: s.visits.map((v) => (v.id === id ? updated : v)),
      }));
    } catch (err) {
      set({ error: err?.message ?? 'Failed to move appointment' });
      throw err;
    }
  },
}));
