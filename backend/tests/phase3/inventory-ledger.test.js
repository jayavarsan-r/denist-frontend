// Stock ledger invariants: every change goes through recordStockMovement,
// stock can never go negative, and checkout dispensing never throws.

jest.mock('../../src/config/supabase', () => {
  const { makeSupabaseMock } = require('../phase2/helpers/supabase-mock');
  return makeSupabaseMock((table, calls) => global.__sbResolver(table, calls));
});

const sb = require('../../src/config/supabase');
const { recordStockMovement, dispenseMedicinesAtCheckout } = require('../../src/services/inventory.service');

const itemRow = (qty) => ({ id: 'I1', stock_qty: qty, name: 'Amoxicillin' });

function queriesFor(table, method) {
  return sb._queries.filter((q) => q.table === table && q.calls.some(([m]) => m === method));
}

describe('stock ledger', () => {
  beforeEach(() => { sb._queries.length = 0; });

  test('stock-in: qty increases and an "in" movement is recorded', async () => {
    global.__sbResolver = (table, calls) => {
      if (table === 'inventory_items' && calls.some(([m]) => m === 'maybeSingle')) return { data: itemRow(10), error: null };
      if (table === 'stock_movements') return { data: { id: 'M1' }, error: null };
      return { data: null, error: null };
    };
    const result = await recordStockMovement({ clinicId: 'C1', itemId: 'I1', direction: 'in', qty: 5, reason: 'purchase' });
    expect(result.data.new_qty).toBe(15);
    const update = queriesFor('inventory_items', 'update')[0];
    expect(update.calls.find(([m]) => m === 'update')[1].stock_qty).toBe(15);
    const movement = queriesFor('stock_movements', 'insert')[0];
    expect(movement.calls.find(([m]) => m === 'insert')[1]).toMatchObject({ direction: 'in', qty: 5, reason: 'purchase' });
  });

  test('out more than available → insufficient_stock, stock untouched, no movement', async () => {
    global.__sbResolver = (table, calls) => {
      if (table === 'inventory_items' && calls.some(([m]) => m === 'maybeSingle')) return { data: itemRow(2), error: null };
      return { data: null, error: null };
    };
    const result = await recordStockMovement({ clinicId: 'C1', itemId: 'I1', direction: 'out', qty: 5, reason: 'adjustment' });
    expect(result).toEqual({ error: 'insufficient_stock', available: 2 });
    expect(queriesFor('inventory_items', 'update')).toHaveLength(0);
    expect(queriesFor('stock_movements', 'insert')).toHaveLength(0);
  });

  test('zero/negative qty and bad direction are rejected before any query', async () => {
    global.__sbResolver = () => ({ data: null, error: null });
    expect(await recordStockMovement({ clinicId: 'C1', itemId: 'I1', direction: 'out', qty: 0, reason: 'x' })).toEqual({ error: 'qty_must_be_positive' });
    expect(await recordStockMovement({ clinicId: 'C1', itemId: 'I1', direction: 'sideways', qty: 1, reason: 'x' })).toEqual({ error: 'invalid_direction' });
    expect(sb._queries).toHaveLength(0);
  });

  test('unknown item → item_not_found', async () => {
    global.__sbResolver = () => ({ data: null, error: null });
    expect(await recordStockMovement({ clinicId: 'C1', itemId: 'NOPE', direction: 'in', qty: 1, reason: 'purchase' }))
      .toEqual({ error: 'item_not_found' });
  });
});

describe('checkout dispensing', () => {
  beforeEach(() => { sb._queries.length = 0; });

  test('dispenses resolved medicines, skips unresolved and zero-qty ones', async () => {
    global.__sbResolver = (table, calls) => {
      if (table === 'inventory_items' && calls.some(([m]) => m === 'maybeSingle')) return { data: itemRow(20), error: null };
      if (table === 'stock_movements') return { data: { id: 'M1' }, error: null };
      return { data: null, error: null };
    };
    const results = await dispenseMedicinesAtCheckout({
      clinicId: 'C1', visitId: 'V1', staffId: 'S1',
      medicines: [
        { resolved_item_id: 'I1', qty_dispensed: 15 },
        { resolved_item_id: null, qty_dispensed: 5 },  // unresolved — skipped
        { resolved_item_id: 'I1', qty_dispensed: 0 },  // not dispensed — skipped
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0].data.new_qty).toBe(5);
    const movement = queriesFor('stock_movements', 'insert')[0];
    expect(movement.calls.find(([m]) => m === 'insert')[1]).toMatchObject({ reason: 'dispensed_checkout', reference_id: 'V1' });
  });

  test('insufficient stock at checkout is a warning result, never a throw', async () => {
    global.__sbResolver = (table, calls) => {
      if (table === 'inventory_items' && calls.some(([m]) => m === 'maybeSingle')) return { data: itemRow(1), error: null };
      return { data: null, error: null };
    };
    const results = await dispenseMedicinesAtCheckout({
      clinicId: 'C1', visitId: 'V1', staffId: 'S1',
      medicines: [{ resolved_item_id: 'I1', qty_dispensed: 10 }],
    });
    expect(results[0].error).toBe('insufficient_stock');
    expect(results[0].available).toBe(1);
  });

  test('accepts item_id as an alias of resolved_item_id (checkout-summary medicines)', async () => {
    global.__sbResolver = (table, calls) => {
      if (table === 'inventory_items' && calls.some(([m]) => m === 'maybeSingle')) return { data: itemRow(20), error: null };
      if (table === 'stock_movements') return { data: { id: 'M1' }, error: null };
      return { data: null, error: null };
    };
    const results = await dispenseMedicinesAtCheckout({
      clinicId: 'C1', visitId: null, staffId: 'S1',
      medicines: [{ item_id: 'I1', qty_dispensed: 2 }],
    });
    expect(results[0].data.new_qty).toBe(18);
  });
});
