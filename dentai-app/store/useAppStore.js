import { create } from 'zustand';
import { getToken, clearToken } from '@/lib/api/client';

export const useAppStore = create((set, get) => ({
  // Auth
  token: null,
  staffId: null,
  clinicId: null,
  name: '',
  role: null,

  // Clinic config (populated after setup or from API)
  clinic: {
    doctorName: '',
    specialty: 'General Dentistry',
    clinicName: '',
    city: '',
    address: '',
    days: [1, 2, 3, 4, 5, 6],
    open: '09:00',
    close: '18:00',
    slot: 30,
  },

  // App flow state
  started: false,
  consultMode: false,
  doctorSetupDone: false,
  patientsFocus: false,
  scheduleView: 'Week',

  // UI state
  toast: '',
  activeSheet: null,
  _toastTimer: null,

  /* ─── Auth actions ─── */
  setAuth: ({ token, staffId, role, clinicId, name, clinicName, clinicCity, joinCode }) =>
    set({
      token,
      staffId,
      role,
      clinicId,
      name,
      started: true,
      doctorSetupDone: !!clinicId,
      clinic: {
        ...get().clinic,
        doctorName: name || '',
        clinicName: clinicName || '',
        city: clinicCity || '',
        joinCode: joinCode || '',
      },
    }),

  // Called after verifying token on app start (GET /api/auth/me)
  hydrateAuth: ({ staff, clinic }) => {
    const roleVal = staff?.role || null;
    set({
      token: getToken(),
      staffId: staff?.id || null,
      role: roleVal,
      clinicId: clinic?.id || null,
      name: staff?.name || '',
      started: true,
      doctorSetupDone: !!clinic?.id,
      clinic: {
        ...get().clinic,
        doctorName: staff?.name || '',
        clinicName: clinic?.name || '',
        city: clinic?.city || '',
        joinCode: clinic?.join_code || '',
      },
    });
  },

  signOut: () => {
    clearToken();
    set({
      token: null, staffId: null, role: null, clinicId: null, name: '',
      started: false, consultMode: false, doctorSetupDone: false,
      patientsFocus: false, scheduleView: 'Week', activeSheet: null,
      clinic: {
        doctorName: '', specialty: 'General Dentistry', clinicName: '',
        city: '', address: '', days: [1, 2, 3, 4, 5, 6],
        open: '09:00', close: '18:00', slot: 30,
      },
    });
  },

  /* ─── Clinic / setup ─── */
  saveClinic: (c) => set({ clinic: c, doctorSetupDone: true }),

  /* ─── Consultation mode ─── */
  enterConsult: () => set({ consultMode: true }),
  exitConsult: () => set({ consultMode: false }),

  /* ─── Sheets ─── */
  openSheet: (name, params = {}) => set({ activeSheet: { name, params } }),
  closeSheet: () => set({ activeSheet: null }),

  /* ─── Toast ─── */
  showToast: (msg) => {
    const t = get()._toastTimer;
    if (t) clearTimeout(t);
    const timer = setTimeout(() => set({ toast: '' }), 2400);
    set({ toast: msg, _toastTimer: timer });
  },

  /* ─── Schedule ─── */
  setScheduleView: (v) => set({ scheduleView: v }),
  setPatientsFocus: (v) => set({ patientsFocus: v }),
  clearPatientsFocus: () => set({ patientsFocus: false }),

  /* ─── Legacy compatibility ─── */
  setStarted: (v) => set({ started: v }),
  pickRole: (r) => set({ role: r, consultMode: false }),
  switchRole: () => set({ role: null, consultMode: false }),
}));
