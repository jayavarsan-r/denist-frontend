import { create } from 'zustand';
import {
  listPatients,
  getPatient,
  createPatient,
  updatePatient as apiUpdatePatient,
} from '@/lib/services/patient.service';

// Map DB values (lowercase) → display values
const GENDER_MAP = { male: 'Male', female: 'Female', other: 'Other', M: 'Male', F: 'Female', Other: 'Other' };

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function normalisePatient(raw) {
  return {
    id: raw.patient_id ?? raw.id,
    name: raw.name ?? '',
    phone: raw.phone ?? '',
    age: raw.age ?? null,
    gender: GENDER_MAP[raw.gender] ?? raw.gender ?? '',
    bloodGroup: raw.blood_group ?? '',
    hasDiabetes: raw.has_diabetes ?? false,
    hasHypertension: raw.has_hypertension ?? false,
    hasHeartCondition: raw.has_heart_condition ?? false,
    isPregnant: raw.is_pregnant ?? false,
    isOnBloodThinners: raw.is_on_blood_thinners ?? false,
    allergies: toArray(raw.allergies),
    currentMedications: toArray(raw.current_medications),
    clinicalNotes: raw.clinical_notes ?? '',
    chiefComplaint: raw.chief_complaint ?? '',
    status: raw.status ?? 'current',
    createdAt: raw.created_at ?? null,
    teeth: raw.teeth ?? {},
  };
}

export const usePatientStore = create((set, get) => ({
  patients: [],
  loading: false,
  error: null,

  loadPatients: async (search) => {
    set({ loading: true, error: null });
    try {
      const raw = await listPatients(search);
      const list = raw?.patients || raw?.data || (Array.isArray(raw) ? raw : []);
      const patients = list.map(normalisePatient);
      set({ patients, loading: false });
    } catch (err) {
      set({ error: err?.message ?? 'Failed to load patients', loading: false });
    }
  },

  fetchPatient: async (id) => {
    set({ loading: true, error: null });
    try {
      const raw = await getPatient(id);
      const patient = normalisePatient(raw?.patient || raw);
      set((s) => {
        const exists = s.patients.some((p) => p.id === patient.id);
        return {
          patients: exists
            ? s.patients.map((p) => (p.id === patient.id ? patient : p))
            : [patient, ...s.patients],
          loading: false,
        };
      });
    } catch (err) {
      set({ error: err?.message ?? 'Failed to fetch patient', loading: false });
    }
  },

  addPatient: async (data) => {
    set({ loading: true, error: null });
    try {
      const raw = await createPatient(data);
      const patient = normalisePatient(raw?.patient || raw);
      set((s) => ({ patients: [patient, ...s.patients], loading: false }));
      return patient;
    } catch (err) {
      set({ error: err?.message ?? 'Failed to create patient', loading: false });
      throw err;
    }
  },

  updatePatient: async (id, patch) => {
    // Optimistic update
    set((s) => ({
      patients: s.patients.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
    try {
      const raw = await apiUpdatePatient(id, patch);
      const updated = normalisePatient(raw);
      set((s) => ({
        patients: s.patients.map((p) => (p.id === id ? updated : p)),
      }));
    } catch (err) {
      set({ error: err?.message ?? 'Failed to update patient' });
      throw err;
    }
  },

  updateToothState: async (pid, tooth, state) => {
    const currentPatient = get().patients.find((p) => p.id === pid);
    const updatedTeeth = { ...(currentPatient?.teeth ?? {}), [tooth]: state };

    // Optimistic update
    set((s) => ({
      patients: s.patients.map((p) =>
        p.id === pid ? { ...p, teeth: updatedTeeth } : p
      ),
    }));

    try {
      const raw = await apiUpdatePatient(pid, { teeth: updatedTeeth });
      const updated = normalisePatient(raw);
      set((s) => ({
        patients: s.patients.map((p) => (p.id === pid ? updated : p)),
      }));
    } catch (err) {
      set({ error: err?.message ?? 'Failed to update tooth state' });
      throw err;
    }
  },
}));
