import { create } from 'zustand';
import { CLINIC, STAFF } from '@/lib/data/queue';

export const useAppStore = create((set, get) => ({
  started: false,
  role: null,
  consultMode: false,
  doctorSetupDone: false,
  patientsFocus: false,
  scheduleView: 'Week',
  toast: '',
  activeSheet: null,
  clinic: {
    doctorName: STAFF.doctor.name,
    specialty: 'General Dentistry',
    clinicName: CLINIC.name,
    city: CLINIC.city,
    address: '',
    days: [1, 2, 3, 4, 5, 6],
    open: '09:00',
    close: '18:00',
    slot: 30,
  },
  _toastTimer: null,

  setStarted: (v) => set({ started: v }),
  pickRole: (r) => set({ role: r, consultMode: false }),
  switchRole: () => set({ role: null, consultMode: false }),
  signOut: () => set({ started: false, role: null, consultMode: false, doctorSetupDone: false, patientsFocus: false, scheduleView: 'Week', activeSheet: null }),
  saveClinic: (c) => set({ clinic: c, doctorSetupDone: true }),
  enterConsult: () => set({ consultMode: true }),
  exitConsult: () => set({ consultMode: false }),

  openSheet: (name, params = {}) => set({ activeSheet: { name, params } }),
  closeSheet: () => set({ activeSheet: null }),

  showToast: (msg) => {
    const t = get()._toastTimer;
    if (t) clearTimeout(t);
    const timer = setTimeout(() => set({ toast: '' }), 2400);
    set({ toast: msg, _toastTimer: timer });
  },

  setScheduleView: (v) => set({ scheduleView: v }),
  setPatientsFocus: (v) => set({ patientsFocus: v }),
  clearPatientsFocus: () => set({ patientsFocus: false }),
}));
