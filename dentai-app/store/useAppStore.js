import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getToken, clearToken } from '@/lib/api/client';

// SSR-safe storage: the factory is only touched on the client. During prerender
// (static export / next dev SSR) there is no localStorage, so we hand back a noop.
const safeStorage = createJSONStorage(() =>
  (typeof window !== 'undefined'
    ? window.localStorage
    : { getItem: () => null, setItem: () => {}, removeItem: () => {} })
);

export const useAppStore = create(persist((set, get) => ({
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

  // Prescription design (persisted in localStorage)
  prescriptionDesign: {
    doctorName: '',
    qualification: '',
    regNumber: '',
    clinicPhone: '',
    signatureDataUrl: null,
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

  // Bumped after a clinical write (e.g. a voice consult) so any open patient screen
  // refetches its case sheet / tooth history / visits without a manual reload.
  patientDataVersion: 0,

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
    // Non-destructive: the offline fallback (FlowGuard catch branch) calls this with
    // only ids/role decoded from the JWT — no name/clinic. Falling back to the
    // existing (cached/persisted) values prevents a failed /auth/me refresh from
    // blanking the identity back to defaults.
    const prev = get();
    const prevClinic = prev.clinic;
    set({
      token: getToken(),
      staffId: staff?.id || prev.staffId || null,
      role: staff?.role || prev.role || null,
      clinicId: clinic?.id || prev.clinicId || null,
      name: staff?.name || prev.name || '',
      started: true,
      doctorSetupDone: !!(clinic?.id || prev.clinicId),
      clinic: {
        ...prevClinic,
        doctorName: staff?.name || prevClinic.doctorName || '',
        clinicName: clinic?.name || prevClinic.clinicName || '',
        city: clinic?.city || prevClinic.city || '',
        joinCode: clinic?.join_code || prevClinic.joinCode || '',
        settings: clinic?.settings || prevClinic.settings || {},
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
  updateClinicLocal: (patch) => set((s) => ({ clinic: { ...s.clinic, ...patch } })),

  /* ─── Prescription design ─── */
  setPrescriptionDesign: (patch) => {
    const next = { ...get().prescriptionDesign, ...patch };
    try {
      const { signatureDataUrl, ...rest } = next;
      localStorage.setItem('rx_design', JSON.stringify(rest));
      if (signatureDataUrl !== undefined) localStorage.setItem('rx_sig', signatureDataUrl || '');
    } catch {}
    set({ prescriptionDesign: next });
  },
  hydratePrescriptionDesign: () => {
    try {
      const saved = JSON.parse(localStorage.getItem('rx_design') || '{}');
      const sig = localStorage.getItem('rx_sig') || null;
      set((s) => ({ prescriptionDesign: { ...s.prescriptionDesign, ...saved, signatureDataUrl: sig || null } }));
    } catch {}
  },

  /* ─── Consultation mode ─── */
  enterConsult: () => set({ consultMode: true }),
  exitConsult: () => set({ consultMode: false }),

  /* ─── Sheets ─── */
  openSheet: (name, params = {}) => set({ activeSheet: { name, params } }),
  closeSheet: () => set({ activeSheet: null }),

  /* ─── Data refresh signal ─── */
  refreshPatientData: () => set((s) => ({ patientDataVersion: s.patientDataVersion + 1 })),

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
}), {
  name: 'dentai_app',
  storage: safeStorage,
  // We rehydrate manually (in FlowGuard) so the server HTML and the first client
  // render both start from defaults — restoring from cache during render would
  // cause a hydration mismatch (same reason getGreeting() runs only after mount).
  skipHydration: true,
  // Only the identity slice survives a reload. Transient UI (sheets, toast, consult
  // mode) and data-store caches stay ephemeral.
  partialize: (s) => ({
    staffId: s.staffId,
    clinicId: s.clinicId,
    name: s.name,
    role: s.role,
    started: s.started,
    doctorSetupDone: s.doctorSetupDone,
    clinic: s.clinic,
  }),
}));
