const express = require('express');
const request = require('supertest');
const { responseEnvelope, ok, fail } = require('../src/utils/response');
const errorHandler = require('../src/middleware/errorHandler');
const { AppError } = require('../src/utils/errors');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(responseEnvelope);
  app.get('/plain', (req, res) => res.json({ patients: [1, 2] }));
  app.get('/created', (req, res) => res.status(201).json({ patient: { id: 1 } }));
  app.get('/legacy-error', (req, res) => res.status(400).json({ error: 'bad input' }));
  app.get('/ok-helper', (req, res) => ok(res, { x: 1 }));
  app.get('/fail-helper', (req, res) => fail(res, 'FORBIDDEN', 'nope', null, 403));
  app.get('/throw', (req, res, next) => next(new AppError('NOT_FOUND', 'missing')));
  app.use(errorHandler);
  return app;
}

describe('response envelope', () => {
  const app = buildApp();

  test('wraps a plain 2xx body in { success, data } with inner keys preserved', async () => {
    const res = await request(app).get('/plain');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { patients: [1, 2] } });
  });

  test('preserves the status code (201)', async () => {
    const res = await request(app).get('/created');
    expect(res.status).toBe(201);
    expect(res.body.data.patient.id).toBe(1);
  });

  test('converts a legacy { error } 4xx into the failure envelope', async () => {
    const res = await request(app).get('/legacy-error');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: { code: 'VALIDATION_ERROR', message: 'bad input', details: null } });
  });

  test('ok()/fail() helpers produce the envelope', async () => {
    expect((await request(app).get('/ok-helper')).body).toEqual({ success: true, data: { x: 1 } });
    const f = await request(app).get('/fail-helper');
    expect(f.status).toBe(403);
    expect(f.body).toEqual({ success: false, error: { code: 'FORBIDDEN', message: 'nope', details: null } });
  });

  test('errorHandler emits the failure envelope for thrown AppErrors', async () => {
    const res = await request(app).get('/throw');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { code: 'NOT_FOUND', message: 'missing', details: null } });
  });
});
