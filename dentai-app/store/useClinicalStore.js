import { create } from 'zustand';
import { getTreatmentPlan, createTreatmentPlan, updateTreatmentPlan, getPendingTreatmentPlans } from '@/lib/services/treatment-plan.service';
import { createPrescription, getPrescription } from '@/lib/services/prescription.service';
import { recordPayment, getPatientPayments, getPaymentStats } from '@/lib/services/payment.service';
import { getLabOrders, getPatientLabOrders, createLabOrder, updateLabOrder } from '@/lib/services/lab.service';
import { listLedger, createLedgerEntry, deleteLedgerEntry } from '@/lib/services/ledger.service';
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
  // Finance screen (API-backed): clinic-wide collection totals + plans still owed on.
  paymentStats: { today: 0, month: 0, total: 0 },
  pendingPlans: [],
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
        // Link the Rx to the visit it was written during, so the case-detail view can
        // show the structured prescription under that specific visit (previously every
        // consult Rx was saved with visit_id=null and floated free of its visit).
        visitId: r.visitId || null,
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

  /* ─── Lab orders (API-backed) ─── */
  // Clinic-wide list for the finance/lab screen.
  loadLabOrders: async () => {
    try {
      const orders = await getLabOrders();
      set({ labOrders: orders });
    } catch (e) {
      console.warn('[ClinicalStore] loadLabOrders failed', e?.response?.status);
    }
  },

  // Patient-scoped: merge this patient's lab orders into the store.
  loadPatientLabOrders: async (patientId) => {
    try {
      const orders = await getPatientLabOrders(patientId);
      set((s) => ({
        labOrders: [
          ...s.labOrders.filter((l) => l.patientId !== patientId),
          ...orders,
        ],
      }));
    } catch (e) {
      console.warn('[ClinicalStore] loadPatientLabOrders failed', e?.response?.status);
    }
  },

  markLabReceived: async (id) => {
    // Optimistic, then persist.
    set((s) => ({
      labOrders: s.labOrders.map((l) =>
        l.id === id ? { ...l, status: 'received', actualReturnDate: new Date().toISOString().slice(0, 10) } : l
      ),
    }));
    try {
      const updated = await updateLabOrder(id, { status: 'received' });
      set((s) => ({ labOrders: s.labOrders.map((l) => (l.id === id ? updated : l)) }));
    } catch (e) {
      console.warn('[ClinicalStore] markLabReceived failed', e?.response?.status);
    }
  },

  updateLabStatus: async (id, status) => {
    try {
      const updated = await updateLabOrder(id, { status });
      set((s) => ({ labOrders: s.labOrders.map((l) => (l.id === id ? updated : l)) }));
      return updated;
    } catch (e) {
      console.warn('[ClinicalStore] updateLabStatus failed', e?.response?.status);
    }
  },

  addLabOrder: async (l) => {
    try {
      const order = await createLabOrder({
        patientId: l.patientId,
        treatmentPlanId: l.treatmentPlanId || null,
        procedureType: l.procedureType || null,
        toothNumber: l.toothNumber != null ? String(l.toothNumber) : null,
        labName: l.labName,
        workDescription: l.workDescription || null,
        shade: l.shade || null,
        impressionType: l.impressionType || null,
        sentDate: l.sentDate || null,
        expectedReturnDate: l.expectedReturnDate || null,
        costToClinic: l.costToClinic || 0,
        chargedToPatient: l.chargedToPatient || 0,
        status: l.status || 'sent',
        notes: l.notes || null,
      });
      set((s) => ({ labOrders: [order, ...s.labOrders] }));
      return order;
    } catch (e) {
      console.warn('[ClinicalStore] addLabOrder failed', e?.response?.status);
      // Local fallback so the UI still reflects the action.
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

  /* ─── Clinic accounts / ledger (API-backed) ─── */
  loadLedger: async () => {
    try {
      const { ledgerEntries } = await listLedger();
      const entries = (ledgerEntries || []).map(normLedger);
      set((s) => ({
        // keep payment-derived entries (added by loadClinicPayments), replace only
        // the manually-entered ledger rows on reload (matched by id).
        clinicAccounts: [
          ...entries,
          ...s.clinicAccounts.filter((a) => !entries.some((e) => e.id === a.id)),
        ],
      }));
    } catch (e) {
      console.warn('[ClinicalStore] loadLedger failed', e?.response?.status);
    }
  },

  addLedgerEntry: async (entry) => {
    const { entry: row } = await createLedgerEntry(entry);
    const norm = normLedger(row);
    set((s) => ({ clinicAccounts: [norm, ...s.clinicAccounts] }));
    return norm;
  },

  removeLedgerEntry: async (id) => {
    const prev = get().clinicAccounts;
    set((s) => ({ clinicAccounts: s.clinicAccounts.filter((a) => a.id !== id) }));
    try { await deleteLedgerEntry(id); }
    catch (e) { set({ clinicAccounts: prev }); throw e; }
  },

  /* ─── Payments (API-backed via payment service) ─── */
  // Clinic-wide ledger for the finance screen. Pulls every payment in the clinic and
  // maps each to an income account entry. `date` is sliced to YYYY-MM-DD so the
  // finance page's `date === today` filter (Collected today) matches reliably.
  loadClinicPayments: async () => {
    try {
      const { data } = await apiClient.get('/api/payments');
      const list = data?.payments || data || [];
      const entries = list.map((p) => ({
        id: p.id,
        date: (p.payment_date || p.paymentDate || '').slice(0, 10),
        type: 'income',
        category: 'Treatment',
        description: p.patients?.name || 'Payment received',
        // What the payment was for — the linked plan's procedure (e.g. "RCT").
        procedure: p.treatment_plans?.procedure_name || 'Consultation',
        amount: parseFloat(p.amount) || 0,
        patientId: p.patient_id || p.patientId,
        method: p.payment_method || p.paymentMethod || null,
      }));
      set({ clinicAccounts: entries });
    } catch (e) {
      console.warn('[ClinicalStore] loadClinicPayments failed', e?.response?.status);
    }
  },

  // Today / this-month / all-time collection totals for the finance header.
  loadPaymentStats: async () => {
    try {
      const stats = await getPaymentStats();
      set({
        paymentStats: {
          today: parseFloat(stats?.today) || 0,
          month: parseFloat(stats?.month) || 0,
          total: parseFloat(stats?.total) || 0,
        },
      });
    } catch (e) {
      console.warn('[ClinicalStore] loadPaymentStats failed', e?.response?.status);
    }
  },

  // Treatment plans with money still owed — the finance "pending payments" list.
  loadPendingPlans: async () => {
    try {
      const plans = await getPendingTreatmentPlans();
      set({
        pendingPlans: plans.map((p) => ({
          id: p.id,
          patientId: p.patient_id || p.patients?.id,
          patientName: p.patients?.name || 'Patient',
          procedure: p.procedure_name || 'Treatment',
          estimatedCost: parseFloat(p.estimated_cost) || 0,
          collectedAmount: parseFloat(p.collected_amount) || 0,
          pendingAmount: p.pending_amount != null
            ? parseFloat(p.pending_amount) || 0
            : Math.max(0, (parseFloat(p.estimated_cost) || 0) - (parseFloat(p.collected_amount) || 0)),
          createdAt: (p.created_at || '').slice(0, 10),
          status: p.status,
        })).filter((p) => p.pendingAmount > 0),
      });
    } catch (e) {
      console.warn('[ClinicalStore] loadPendingPlans failed', e?.response?.status);
    }
  },

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
function normLedger(r) {
  return {
    id: r.id,
    date: (r.entry_date || r.entryDate || r.created_at || '').slice(0, 10),
    type: r.type || 'expense',
    category: r.category || 'Other',
    description: r.description || r.category || '',
    amount: parseFloat(r.amount) || 0,
    patientId: r.patient_id || r.patientId || null,
  };
}

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
