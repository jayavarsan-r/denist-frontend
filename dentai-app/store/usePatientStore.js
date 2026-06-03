import { create } from 'zustand';
import { patients as seedPatients } from '@/lib/data/patients';

export const usePatientStore = create((set) => ({
  patients: seedPatients,

  addPatient: (p) => set((s) => ({ patients: [p, ...s.patients] })),

  updatePatient: (id, patch) =>
    set((s) => ({ patients: s.patients.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

  updateToothState: (pid, tooth, state) =>
    set((s) => ({
      patients: s.patients.map((p) =>
        p.id === pid ? { ...p, teeth: { ...p.teeth, [tooth]: state } } : p
      ),
    })),
}));
