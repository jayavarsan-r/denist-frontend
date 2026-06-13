import { apiClient } from '../api/client';

// The NEW lab case tracker (Phase 4) — separate from the legacy lab.service.js
// (lab_orders), which keeps serving the old finance/lab screen.

export async function listLabCases(params = {}) {
  const { data } = await apiClient.get('/api/lab-cases', { params });
  return data.cases || [];
}

export async function createLabCase(body) {
  const { data } = await apiClient.post('/api/lab-cases', body);
  return data.case || data;
}

export async function getLabCase(id) {
  const { data } = await apiClient.get(`/api/lab-cases/${id}`);
  return data; // { case, events, files, messages }
}

export async function updateLabCase(id, patch) {
  const { data } = await apiClient.patch(`/api/lab-cases/${id}`, patch);
  return data.case || data;
}

export async function setLabCaseStatus(id, status) {
  const { data } = await apiClient.patch(`/api/lab-cases/${id}/status`, { status });
  return data.case || data;
}

export async function cancelLabCase(id) {
  const { data } = await apiClient.delete(`/api/lab-cases/${id}`);
  return data.case || data;
}

export async function listLabs() {
  const { data } = await apiClient.get('/api/labs');
  return data.labs || [];
}

export async function createLab(body) {
  const { data } = await apiClient.post('/api/labs', body);
  return data.lab || data;
}

export async function updateLab(id, patch) {
  const { data } = await apiClient.patch(`/api/labs/${id}`, patch);
  return data.lab || data;
}

export async function getReceptionInbox() {
  const { data } = await apiClient.get('/api/reception/inbox');
  return data.items || [];
}

export async function resolveInboxItem(id, { labCaseId, newStatus } = {}) {
  const { data } = await apiClient.patch(`/api/reception/inbox/${id}/resolve`, {
    labCaseId: labCaseId || null, newStatus: newStatus || null,
  });
  return data.item || data;
}

// ── Shared display constants ──────────────────────────────────────────────────

export const LAB_CASE_TYPES = [
  ['crown_pfm', 'Crown · PFM'], ['crown_zirconia', 'Crown · Zirconia'], ['bridge', 'Bridge'],
  ['denture_full', 'Denture · Full'], ['denture_partial', 'Denture · Partial'],
  ['aligner', 'Aligner'], ['inlay_onlay', 'Inlay / Onlay'], ['other', 'Other'],
];

export const STATUS_META = {
  DRAFT:        { label: 'Draft',        dot: '#9CA3AF' },
  SENT:         { label: 'Sent',         dot: '#3B82F6' },
  ACKNOWLEDGED: { label: 'Acknowledged', dot: '#0891B2' },
  IN_PROGRESS:  { label: 'In progress',  dot: '#8B5CF6' },
  READY:        { label: 'Ready',        dot: '#16A34A' },
  DISPATCHED:   { label: 'Dispatched',   dot: '#0EA5E9' },
  RECEIVED:     { label: 'Received',     dot: '#15803D' },
  FITTED:       { label: 'Fitted',       dot: '#6B7280' },
  ISSUE_RAISED: { label: 'Issue',        dot: '#EF4444' },
  CANCELLED:    { label: 'Cancelled',    dot: '#9CA3AF' },
};

// Mirrors the backend state machine for the manual-move buttons (reception can
// also move backward — the backend allows any reception_manual transition).
export const NEXT_STATUSES = {
  DRAFT:        ['SENT', 'CANCELLED'],
  SENT:         ['ACKNOWLEDGED', 'ISSUE_RAISED', 'CANCELLED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'ISSUE_RAISED', 'CANCELLED'],
  IN_PROGRESS:  ['READY', 'ISSUE_RAISED', 'CANCELLED'],
  READY:        ['DISPATCHED', 'ISSUE_RAISED'],
  ISSUE_RAISED: ['IN_PROGRESS', 'CANCELLED'],
  DISPATCHED:   ['RECEIVED'],
  RECEIVED:     ['FITTED'],
  FITTED:       [],
  CANCELLED:    [],
};
