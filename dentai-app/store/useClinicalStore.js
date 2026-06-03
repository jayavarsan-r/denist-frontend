import { create } from 'zustand';
import { getTreatmentPlan, createTreatmentPlan, updateTreatmentPlan } from '@/lib/services/treatment-plan.service';
import { createPrescription, getPrescription } from '@/lib/services/prescription.service';
import { recordPayment, getPatientPayments } from '@/lib/services/payment.service';
import { apiClient } from '@/lib/api/client';

/**
 * useClinicalStore
 *
 * Manages procedures, lab orders, bills, prescriptions, and accounts.
 *
 * Procedures, lab orders, and bills do not yet have backend endpoints — they
 * are tracked locally (in-memory) until the backend is extended.
 *
 * Prescriptions and payments have full backend support and are API-backed.
 */
export const useClinicalStore = create((set, get) => ({
  procedures: [],
  labOrders: [],
  bills: [],
  prescriptions: [],
  clinicAccounts: [],
  loading: false,
  error: null,

  /* ─── Prescriptions (API-backed) ─── */
  loadPatientPrescriptions: async (patientId) => {
    try {
      const { data } = await apiClient.get(`/api/patients/${patientId}/prescriptions`);
      const rxList = (data.prescriptions || data || []).map(normRx);
      set((s) => ({
        prescriptions: [
          ...s.prescriptions.filter(r => r.patientId !== patientId),
          ...rxList,
        ],
      }));
    } catch (e) {
      // non-fatal — just log
      console.warn('[ClinicalStore] loadPatientPrescriptions failed', e?.response?.status);
    }
  },

  saveRx: async (r) => {
    try {
      const res = await createPrescription({
        patientId: r.patientId,
        medicines: r.medicines || [],
        instructions: r.instructions || '',
        followUp: r.followUpDays ? `${r.followUpDays} days` : (r.followUp || ''),
        rawVoice: r.rawVoice,
      });
      const norm = normRx(res.prescription || res);
      set((s) => ({
        prescriptions: s.prescriptions.some(x => x.id === norm.id)
          ? s.prescriptions.map(x => x.id === norm.id ? norm : x)
          : [norm, ...s.prescriptions],
      }));
      return norm;
    } catch (e) {
      // Fallback: save locally only
      const fallback = { ...r, id: r.id || 'rx_' + Date.now() };
      set((s) => ({
        prescriptions: s.prescriptions.some(x => x.id === fallback.id)
          ? s.prescriptions.map(x => x.id === fallback.id ? fallback : x)
          : [fallback, ...s.prescriptions],
      }));
      return fallback;
    }
  },

  /* ─── Treatment Plans (API-backed) ─── */
  loadPatientTreatmentPlans: async (patientId) => {
    try {
      const { data } = await apiClient.get(`/api/patients/${patientId}/treatment-plans`);
      const plans = (data.treatment_plans || data.treatmentPlans || data || []);
      // Treatment plans map to "procedures" locally until we have a procedures endpoint
      // Store the raw plans for reference
      set((s) => ({ _treatmentPlans: { ...s._treatmentPlans, [patientId]: plans } }));
    } catch (e) {
      console.warn('[ClinicalStore] loadPatientTreatmentPlans failed', e?.response?.status);
    }
  },

  /* ─── Procedures (local-only until backend endpoint exists) ─── */
  advanceProcedure: (id) =>
    set((s) => ({
      procedures: s.procedures.map((pr) => {
        if (pr.id !== id) return pr;
        const idx = pr.stages.findIndex((st) => !st.completed);
        const today = new Date().toISOString().slice(0, 10);
        const stages = pr.stages.map((st, i) =>
          i === idx ? { ...st, completed: true, date: today } : st
        );
        const completedVisits = Math.min(pr.estimatedVisits, pr.completedVisits + 1);
        const allDone = stages.every((st) => st.completed);
        return {
          ...pr, stages, completedVisits,
          currentStage: (stages.find((st) => !st.completed) || stages[stages.length - 1]).name,
          status: allDone ? 'completed' : 'in_progress',
        };
      }),
    })),

  addProcedure: (p) => set((s) => ({ procedures: [p, ...s.procedures] })),

  /* ─── Lab orders (local-only until backend endpoint exists) ─── */
  markLabReceived: (id) =>
    set((s) => ({
      labOrders: s.labOrders.map((l) =>
        l.id === id ? { ...l, status: 'received', actualReturnDate: new Date().toISOString().slice(0, 10) } : l
      ),
    })),

  addLabOrder: async (l) => {
    // Try API first (endpoint may not exist yet)
    try {
      const { data } = await apiClient.post('/api/lab-orders', l);
      const order = data.lab_order || data;
      set((s) => ({ labOrders: [order, ...s.labOrders] }));
      return order;
    } catch {
      // Fallback to local
      const local = { ...l, id: l.id || 'lab_' + Date.now() };
      set((s) => ({ labOrders: [local, ...s.labOrders] }));
      return local;
    }
  },

  /* ─── Bills (local-only until backend endpoint exists) ─── */
  saveBill: async (b) => {
    set((s) => ({
      bills: s.bills.some((x) => x.id === b.id)
        ? s.bills.map((x) => (x.id === b.id ? b : x))
        : [b, ...s.bills],
    }));
  },

  /* ─── Clinic accounts / ledger (local-only) ─── */
  addAccount: (a) => set((s) => ({ clinicAccounts: [a, ...s.clinicAccounts] })),

  /* ─── Payments (API-backed via payment service) ─── */
  loadPatientPayments: async (patientId) => {
    try {
      const payments = await getPatientPayments(patientId);
      // Map to account entries for the finance view
      const entries = (payments.payments || payments || []).map(p => ({
        id: p.id,
        date: p.payment_date || p.paymentDate,
        type: 'income',
        category: 'Treatment',
        description: `Payment from patient`,
        amount: p.amount,
        patientId: p.patient_id || p.patientId,
      }));
      set((s) => ({
        clinicAccounts: [
          ...s.clinicAccounts.filter(a => a.patientId !== patientId),
          ...entries,
        ],
      }));
    } catch (e) {
      console.warn('[ClinicalStore] loadPatientPayments failed', e?.response?.status);
    }
  },
}));

/* ─── Helpers ─── */
function normRx(r) {
  return {
    id: r.id,
    patientId: r.patient_id || r.patientId,
    patientName: r.patient_name || r.patientName || '',
    date: r.created_at ? r.created_at.slice(0, 10) : (r.date || new Date().toISOString().slice(0, 10)),
    medicines: (r.medicines || []).map(m => ({
      name: m.name || '',
      dosage: m.dose || m.dosage || '',
      frequency: m.frequency || 'OD',
      duration: m.duration || '5 days',
      notes: m.instructions || m.notes || '',
      uncertain: m.uncertain || false,
      slots: m.meal_timing_slots || m.slots || { breakfast: true, lunch: false, dinner: true },
    })),
    instructions: r.instructions || '',
    followUpDays: r.follow_up_days || r.followUpDays || 7,
  };
}
