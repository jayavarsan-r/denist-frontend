import { apiClient } from '../api/client';

export async function listLedger({ type, from, to } = {}) {
  const params = {};
  if (type) params.type = type;
  if (from) params.from = from;
  if (to) params.to = to;
  const { data } = await apiClient.get('/api/ledger', { params });
  return data; // { ledgerEntries: [...] }
}

export async function createLedgerEntry(entry) {
  const { data } = await apiClient.post('/api/ledger', entry);
  return data; // { entry }
}

export async function deleteLedgerEntry(id) {
  await apiClient.delete(`/api/ledger/${id}`);
  return true;
}
