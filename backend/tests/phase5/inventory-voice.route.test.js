// The ai.controller imports config/supabase at load; mock it so the module tree
// imports without a live SUPABASE_URL.
jest.mock('../../src/config/supabase', () => ({ from: () => ({}), storage: { from: () => ({}) } }));
jest.mock('../../src/middleware/auth', () => (req, _res, next) => { req.clinicId = 'CLINIC_TEST'; req.staffId = 'STAFF_TEST'; next(); });
jest.mock('../../src/middleware/requireClinic', () => (req, _res, next) => next());
jest.mock('../../src/services/inventory-voice.service', () => ({
  parseInventoryCommand: jest.fn(),
}));
jest.mock('../../src/services/audit.service', () => ({ log: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { responseEnvelope } = require('../../src/utils/response');
const errorHandler = require('../../src/middleware/errorHandler');
const aiRoutes = require('../../src/routes/ai.routes');
const voice = require('../../src/services/inventory-voice.service');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/api/ai', aiRoutes);
  app.use(errorHandler);
  return app;
}
const app = buildApp();

test('400 when transcript missing', async () => {
  const res = await request(app).post('/api/ai/extract-inventory').send({});
  expect(res.status).toBe(400);
});

test('200 returns the parsed command for the caller clinic', async () => {
  voice.parseInventoryCommand.mockResolvedValue({ intent: 'restock', intent_confidence: 0.9, items: [], query: null, answer: null, unclear_spans: [] });
  const res = await request(app).post('/api/ai/extract-inventory').send({ transcript: 'restock 50 gloves' });
  expect(res.status).toBe(200);
  expect(res.body.data.intent).toBe('restock');
  expect(voice.parseInventoryCommand).toHaveBeenCalledWith('CLINIC_TEST', 'restock 50 gloves');
});
