// Phase 5 Part B7a — analytics endpoints (lab-turnaround, medicine-spend, eod-log).
// Mounts ONLY the analytics router on a minimal express app (the response-envelope
// test pattern) with auth + supabase mocked. No live DB, no full server boot.

// Auth → passthrough that injects a clinic context.
jest.mock('../../src/middleware/auth', () => (req, _res, next) => {
  req.clinicId = 'CLINIC_TEST';
  req.staffId = 'STAFF_TEST';
  next();
});

// Supabase mock: chainable (awaitable) query builder per table + an rpc() stub.
// Tests preset results via global.__sbTables / global.__sbRpc.
jest.mock('../../src/config/supabase', () => {
  const CHAIN = ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'is', 'not',
    'gte', 'lte', 'gt', 'lt', 'or', 'ilike', 'order', 'range', 'limit'];
  const resultFor = (table) => (global.__sbTables && global.__sbTables[table]) || { data: [], error: null };
  const chain = (table) => {
    const q = {};
    CHAIN.forEach((m) => { q[m] = () => q; });
    q.then = (resolve) => resolve(resultFor(table));            // makes `await q` work
    q.single = () => Promise.resolve(resultFor(table));
    q.maybeSingle = q.single;
    return q;
  };
  return {
    from: (table) => chain(table),
    rpc: () => Promise.resolve(global.__sbRpc || { data: [], error: null }),
  };
});

const express = require('express');
const request = require('supertest');
const { responseEnvelope } = require('../../src/utils/response');
const errorHandler = require('../../src/middleware/errorHandler');
const analyticsRouter = require('../../src/routes/analytics.routes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/api/analytics', analyticsRouter);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

beforeEach(() => { global.__sbTables = {}; global.__sbRpc = { data: [], error: null }; });
afterAll(() => { delete global.__sbTables; delete global.__sbRpc; });

describe('GET /api/analytics/lab-turnaround', () => {
  test('returns the per-lab turnaround stats from the SQL function', async () => {
    global.__sbRpc = { data: [{ lab_name: 'Sunrise Lab', avg_days: 4.5, case_count: 3 }], error: null };
    const res = await request(app).get('/api/analytics/lab-turnaround');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ lab_name: 'Sunrise Lab', avg_days: 4.5, case_count: 3 }] });
  });

  test('returns 500 when the RPC errors', async () => {
    global.__sbRpc = { data: null, error: { message: 'function missing' } };
    const res = await request(app).get('/api/analytics/lab-turnaround');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/analytics/medicine-spend', () => {
  test('sums qty × price_per_unit over dispensed_checkout movements', async () => {
    global.__sbTables = {
      stock_movements: {
        data: [
          { qty: 15, inventory_items: { price_per_unit: 4 } }, // 60
          { qty: 10, inventory_items: { price_per_unit: 2 } }, // 20
        ],
        error: null,
      },
    };
    const res = await request(app).get('/api/analytics/medicine-spend');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total_dispensed).toBe(80);
    expect(typeof res.body.data.month).toBe('string');
  });

  test('treats a missing price as zero', async () => {
    global.__sbTables = { stock_movements: { data: [{ qty: 5, inventory_items: null }], error: null } };
    const res = await request(app).get('/api/analytics/medicine-spend');
    expect(res.body.data.total_dispensed).toBe(0);
  });
});

describe('GET /api/analytics/eod-log', () => {
  test('maps notification_logs rows to { summary, status, at }', async () => {
    global.__sbTables = {
      notification_logs: {
        data: [{
          id: 'n1',
          payload: { components: ['Patients seen: 8 · Collected ₹12,000'] },
          status: 'sent',
          sent_at: '2026-06-13T12:30:00.000Z',
          created_at: '2026-06-13T12:30:01.000Z',
        }],
        error: null,
      },
    };
    const res = await request(app).get('/api/analytics/eod-log');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{
      id: 'n1',
      summary: 'Patients seen: 8 · Collected ₹12,000',
      status: 'sent',
      at: '2026-06-13T12:30:00.000Z', // sent_at preferred over created_at
    }]);
  });
});
