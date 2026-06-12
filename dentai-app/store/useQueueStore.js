import { create } from 'zustand';
import {
  getQueue,
  addToQueue as apiAddToQueue,
  updateQueueEntry,
  completeConsult as apiCompleteConsult,
  removeFromQueue as apiRemoveFromQueue,
  reorderQueue as apiReorderQueue,
} from '@/lib/services/queue.service';

function nowTime() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

export const useQueueStore = create((set, get) => ({
  queue: [],
  checkoutsToday: [],
  loading: false,
  error: null,

  /* ─── Load queue from API ─── */
  loadQueue: async () => {
    set({ loading: true, error: null });
    try {
      const data = await getQueue();
      // Normalise API response to the shape the UI expects
      const queue = (data.queue || data || []).map(normaliseEntry);
      set({ queue, loading: false });
    } catch (e) {
      set({ error: e?.response?.data?.message || 'Failed to load queue', loading: false });
    }
  },

  /* ─── Merge a realtime update into the queue ─── */
  mergeEntry: (entry) => {
    const norm = normaliseEntry(entry);
    set((s) => {
      const idx = s.queue.findIndex(e => e.id === norm.id);
      if (idx === -1) return { queue: [...s.queue, norm] };
      const updated = [...s.queue];
      updated[idx] = { ...updated[idx], ...norm };
      return { queue: updated };
    });
  },

  /* ─── Call in patient ─── */
  callIn: async (id) => {
    // Optimistic update
    set((s) => ({
      queue: s.queue.map((e) =>
        e.id === id ? { ...e, status: 'in_consultation', calledInAt: nowTime() } : e
      ),
    }));
    try {
      await updateQueueEntry(id, { status: 'in_consultation' });
    } catch {
      get().loadQueue(); // revert on error
    }
  },

  /* ─── Swap a different waiting patient into the chair ───
     Doctor-first: while one patient is in_consultation, tapping another
     waiting patient calls THEM in and returns the current one to 'waiting'.
     The current patient's consult draft is keyed by entry id in
     useConsultStore, so it survives untouched — no work is lost. */
  swapIn: async (id) => {
    const current = get().queue.find((e) => e.status === 'in_consultation');
    if (current && current.id === id) return; // already in the chair
    set((s) => ({
      queue: s.queue.map((e) => {
        if (current && e.id === current.id) return { ...e, status: 'waiting', calledInAt: null };
        if (e.id === id) return { ...e, status: 'in_consultation', calledInAt: nowTime() };
        return e;
      }),
    }));
    try {
      if (current) await updateQueueEntry(current.id, { status: 'waiting' });
      await updateQueueEntry(id, { status: 'in_consultation' });
    } catch {
      get().loadQueue(); // revert on error
    }
  },

  /* ─── Complete consult — Phase 2: confirms an AI draft from the Verification
     Card. The sheet maps the edited extraction to confirmed_data (draftMapping)
     and passes { draftId, confirmedData }; this is the doctor's explicit gate —
     no clinical record exists until this call succeeds. ─── */
  completeConsult: async (id, { draftId, confirmedData }) => {
    // Optimistic update
    set((s) => {
      let next = s.queue.map((e) =>
        e.id === id
          ? { ...e, status: 'ready_for_checkout', outcome: 'treatment_done', readyAt: nowTime() }
          : e
      );
      const waiting = next
        .filter((e) => e.status === 'waiting')
        .sort((a, b) => a.tokenNumber - b.tokenNumber);
      if (waiting[0]) {
        next = next.map((e) =>
          e.id === waiting[0].id ? { ...e, status: 'in_consultation', calledInAt: nowTime() } : e
        );
      }
      return { queue: next };
    });
    try {
      await apiCompleteConsult(id, { draftId, confirmedData });
    } catch (e) {
      get().loadQueue();
      throw e; // the sheet shows the failure — a silent revert looked like success
    }
  },

  /* ─── Checkout patient ─── */
  checkout: async (id, summary) => {
    set((s) => ({
      queue: s.queue.map((e) => (e.id === id ? { ...e, status: 'checked_out' } : e)),
      checkoutsToday: [{ ...summary, time: nowTime() }, ...s.checkoutsToday],
    }));
    try {
      await updateQueueEntry(id, { status: 'completed' });
    } catch {
      get().loadQueue();
    }
  },

  /* ─── Add patient to queue ─── */
  addToQueue: async ({ patientId, chiefComplaint, priority, xrays }) => {
    const data = await apiAddToQueue({ patientId, chiefComplaint, priority: priority || 'normal' });
    const entry = normaliseEntry(data.entry || data);
    // Idempotent on the backend: it may return an existing active entry. Don't add a
    // duplicate row to the local queue in that case.
    set((s) => (s.queue.some((e) => e.id === entry.id)
      ? { queue: s.queue.map((e) => (e.id === entry.id ? entry : e)) }
      : { queue: [...s.queue, entry] }));
    return entry;
  },

  /* ─── Remove from queue ─── */
  removeFromQueue: async (id) => {
    set((s) => ({ queue: s.queue.filter((e) => e.id !== id) }));
    try {
      await apiRemoveFromQueue(id);
    } catch {
      get().loadQueue();
    }
  },

  /* ─── Reorder ─── */
  reorder: async (id, direction) => {
    try {
      await apiReorderQueue(id, direction);
      get().loadQueue();
    } catch (e) {
      console.error('Reorder failed', e);
    }
  },
}));

/* ─── Normalise backend queue_entry to frontend shape ─── */
function normaliseEntry(e) {
  return {
    id: e.id,
    patientId: e.patient_id ?? e.patientId,
    tokenNumber: e.token_number ?? e.tokenNumber ?? 0,
    status: e.status,
    chiefComplaint: e.chief_complaint ?? e.chiefComplaint ?? '',
    priority: e.priority === 'high' ? 'urgent' : (e.priority || 'normal'),
    checkedInAt: e.checked_in_at ?? e.checkedInAt ?? formatTs(e.created_at),
    calledInAt: e.called_in_at ?? e.calledInAt ?? null,
    readyAt: e.ready_at ?? e.readyAt ?? null,
    assignedDoctor: e.assigned_doctor ?? e.assignedDoctor ?? null,
    assignedDoctorName: e.assigned_doctor_staff?.name ?? e.assignedDoctorName ?? null,
    assignedDoctorRole: e.assigned_doctor_staff?.role ?? e.assignedDoctorRole ?? null,
    patientName: e.patients?.name ?? e.patientName ?? null,
    // The entry's own joined patient — so the queue can render a row even when the
    // local patients store hasn't loaded that patient yet (was making checked-in
    // patients silently disappear from the receptionist's queue).
    patient: e.patients
      ? {
          id: e.patients.id,
          name: e.patients.name,
          phone: e.patients.phone || '',
          age: e.patients.age ?? null,
          gender: e.patients.gender ?? null,
          allergies: Array.isArray(e.patients.allergies) ? e.patients.allergies : [],
          flags: e.patients.clinical_flags ?? e.patients.flags ?? null,
        }
      : (e.patient ?? null),
    xrays: e.xrays || [],
    outcome: e.consultation_outcome ?? e.outcome ?? null,
    consult: e.outcome_metadata ?? e.consult ?? null,
    transcript: e.transcript || '',
    // Keep any extra fields
    ...e._extra,
  };
}

function formatTs(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d)) return null;
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}
