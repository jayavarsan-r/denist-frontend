import { apiClient } from '../api/client';

export async function listInventory(params = {}) {
  const { data } = await apiClient.get('/api/inventory', { params });
  return data.items || [];
}

export async function listMedicines() {
  const { data } = await apiClient.get('/api/inventory/medicines');
  return data.medicines || [];
}

export async function listLowStock() {
  const { data } = await apiClient.get('/api/inventory/low-stock');
  return data.items || [];
}

export async function createInventoryItem(item) {
  const { data } = await apiClient.post('/api/inventory', item);
  return data.item || data;
}

export async function updateInventoryItem(id, patch) {
  const { data } = await apiClient.patch(`/api/inventory/${id}`, patch);
  return data.item || data;
}

export async function stockIn(id, qty, notes) {
  const { data } = await apiClient.post(`/api/inventory/${id}/stock-in`, { qty, notes });
  return data;
}

export async function adjustStock(id, { qty, direction, reason, notes }) {
  const { data } = await apiClient.post(`/api/inventory/${id}/adjustment`, { qty, direction, reason, notes });
  return data;
}

export async function getMovements(id) {
  const { data } = await apiClient.get(`/api/inventory/${id}/movements`);
  return data.movements || [];
}
