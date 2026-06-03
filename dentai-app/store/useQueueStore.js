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

  /* ─── Complete consult ─── */
  completeConsult: async (id, consult) => {
    const entry = get().queue.find(e => e.id === id);
    // Optimistic update
    set((s) => {
      let next = s.queue.map((e) =>
        e.id === id
          ? { ...e, status: 'ready_for_checkout', outcome: 'treatment_done', readyAt: nowTime(), consult }
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
      await apiCompleteConsult(id, {
        patientId:     entry?.patientId || '',
        procedure:     consult?.procedure || '',
        diagnosis:     consult?.diagnosis || '',
        toothNumber:   consult?.tooth ? String(consult.tooth) : null,
        totalSittings: consult?.totalSittings || 1,
        estimatedCost: consult?.estimatedCost || 0,
        transcript:    consult?.transcript || '',
        notes:         consult?.instructions || '',
        medicines:     consult?.medicines || [],
        instructions:  consult?.instructions || '',
        followUp:      consult?.followUp || '',
      });
    } catch {
      get().loadQueue();
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
    try {
      const data = await apiAddToQueue({ patientId, chiefComplaint, priority: priority || 'normal' });
      const entry = normaliseEntry(data.entry || data);
      set((s) => ({ queue: [...s.queue, entry] }));
      return entry;
    } catch (e) {
      throw e;
    }
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
