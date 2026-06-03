import { create } from 'zustand';
import { visits as seedVisits } from '@/lib/data/visits';

export const useVisitStore = create((set) => ({
  visits: seedVisits,

  addVisit: (v) => set((s) => ({ visits: [...s.visits, v] })),

  updateVisit: (id, patch) =>
    set((s) => ({ visits: s.visits.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),

  moveVisit: (id, date, startTime) =>
    set((s) => ({ visits: s.visits.map((v) => (v.id === id ? { ...v, date, startTime } : v)) })),
}));
