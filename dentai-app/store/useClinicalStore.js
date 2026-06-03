import { create } from 'zustand';
import { procedures as seedProcedures } from '@/lib/data/procedures';
import { labOrders as seedLab } from '@/lib/data/lab';
import { bills as seedBills } from '@/lib/data/bills';
import { prescriptions as seedRx } from '@/lib/data/prescriptions';
import { clinicAccounts as seedAccounts } from '@/lib/data/accounts';
import { TODAY } from '@/lib/data/patients';

export const useClinicalStore = create((set) => ({
  procedures: seedProcedures,
  labOrders: seedLab,
  bills: seedBills,
  prescriptions: seedRx,
  clinicAccounts: seedAccounts,

  advanceProcedure: (id) =>
    set((s) => ({
      procedures: s.procedures.map((pr) => {
        if (pr.id !== id) return pr;
        const idx = pr.stages.findIndex((st) => !st.completed);
        const stages = pr.stages.map((st, i) =>
          i === idx ? { ...st, completed: true, date: TODAY } : st
        );
        const completedVisits = Math.min(pr.estimatedVisits, pr.completedVisits + 1);
        const allDone = stages.every((st) => st.completed);
        return {
          ...pr,
          stages,
          completedVisits,
          currentStage: (stages.find((st) => !st.completed) || stages[stages.length - 1]).name,
          status: allDone ? 'completed' : 'in_progress',
        };
      }),
    })),

  markLabReceived: (id) =>
    set((s) => ({
      labOrders: s.labOrders.map((l) =>
        l.id === id ? { ...l, status: 'received', actualReturnDate: TODAY } : l
      ),
    })),

  addLabOrder: (l) => set((s) => ({ labOrders: [l, ...s.labOrders] })),

  saveBill: (b) =>
    set((s) => ({
      bills: s.bills.some((x) => x.id === b.id)
        ? s.bills.map((x) => (x.id === b.id ? b : x))
        : [b, ...s.bills],
    })),

  saveRx: (r) =>
    set((s) => ({
      prescriptions: s.prescriptions.some((x) => x.id === r.id)
        ? s.prescriptions.map((x) => (x.id === r.id ? r : x))
        : [r, ...s.prescriptions],
    })),

  addAccount: (a) => set((s) => ({ clinicAccounts: [a, ...s.clinicAccounts] })),
}));
