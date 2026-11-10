import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from '../../src/app.js';
import * as dbConfig from '../../src/config/db.js';
import { dispatchRequest } from '../helpers/testClient.js';

describe('Step 2.5.1: Express Application Foundation & Probes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /health returns 200 OK with UP status and process uptime', async () => {
    const res = await dispatchRequest(app, { method: 'GET', url: '/health' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /ready returns 503 Service Unavailable when MongoDB is disconnected', async () => {
    vi.spyOn(dbConfig, 'isDbConnected').mockReturnValue(false);
    vi.spyOn(dbConfig, 'getConnectionState').mockReturnValue('disconnected');

    const res = await dispatchRequest(app, { method: 'GET', url: '/ready' });
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('NOT_READY');
    expect(res.body.database).toBe('disconnected');
  });

  it('GET /ready returns 200 OK when MongoDB is connected', async () => {
    vi.spyOn(dbConfig, 'isDbConnected').mockReturnValue(true);
    vi.spyOn(dbConfig, 'getConnectionState').mockReturnValue('connected');

    const res = await dispatchRequest(app, { method: 'GET', url: '/ready' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.database).toBe('connected');
  });

  it('attaches unique X-Request-Id header to every response', async () => {
    const res = await dispatchRequest(app, { method: 'GET', url: '/health' });
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
  });

  it('enforces Helmet security headers', async () => {
    const res = await dispatchRequest(app, { method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('returns standard 404 envelope for non-existent routes', async () => {
    const res = await dispatchRequest(app, { method: 'GET', url: '/api/unknown-non-existent-route' });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.timestamp).toBeDefined();
  });
});
