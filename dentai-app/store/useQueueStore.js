import { create } from 'zustand';
import { queueEntries as seedQueue, checkoutsToday as seedCheckouts, NOW_TIME } from '@/lib/data/queue';

export const useQueueStore = create((set) => ({
  queue: seedQueue,
  checkoutsToday: seedCheckouts,

  callIn: (id) =>
    set((s) => {
      if (s.queue.some((e) => e.status === 'in_consultation')) return s;
      return {
        queue: s.queue.map((e) =>
          e.id === id ? { ...e, status: 'in_consultation', calledInAt: NOW_TIME } : e
        ),
      };
    }),

  completeConsult: (id, consult) =>
    set((s) => {
      let next = s.queue.map((e) =>
        e.id === id
          ? { ...e, status: 'ready_for_checkout', outcome: 'treatment_done', readyAt: NOW_TIME, consult }
          : e
      );
      const waiting = next
        .filter((e) => e.status === 'waiting')
        .sort((a, b) => a.tokenNumber - b.tokenNumber);
      if (waiting[0]) {
        next = next.map((e) =>
          e.id === waiting[0].id ? { ...e, status: 'in_consultation', calledInAt: NOW_TIME } : e
        );
      }
      return { queue: next };
    }),

  checkout: (id, summary) =>
    set((s) => ({
      queue: s.queue.map((e) => (e.id === id ? { ...e, status: 'checked_out' } : e)),
      checkoutsToday: [{ ...summary, time: NOW_TIME }, ...s.checkoutsToday],
    })),

  addToQueue: ({ patientId, chiefComplaint, priority, xrays }) =>
    set((s) => ({
      queue: [
        ...s.queue,
        {
          id: 'q' + Date.now(),
          patientId,
          tokenNumber: Math.max(0, ...s.queue.map((e) => e.tokenNumber)) + 1,
          status: 'waiting',
          chiefComplaint,
          priority: priority || 'normal',
          checkedInAt: NOW_TIME,
          calledInAt: null,
          readyAt: null,
          assignedDoctor: 's1',
          xrays: xrays || [],
          outcome: null,
          consult: null,
          transcript: '',
        },
      ],
    })),

  removeFromQueue: (id) =>
    set((s) => ({ queue: s.queue.filter((e) => e.id !== id) })),
}));
