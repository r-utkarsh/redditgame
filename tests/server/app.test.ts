/**
 * @file        tests/server/app.test.ts
 * @purpose     Proves the Express app sets security headers, hides its signature and returns the generic 404 and 500 bodies.
 * @covers      src/server/app.ts
 * @spec        03-tdd-and-testing.md section 5b; 04-security.md S10; P0-scaffold.md step 6
 */
import type { Server } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp, createErrorHandler } from '../../src/server/app';
import { makeDeps, toDeps } from '../fakes/deps';

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  const deps = makeDeps();
  const app = createApp(toDeps(deps));
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('test server did not expose a TCP port');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

describe('createApp', () => {
  it('returns the generic 404 body and security headers', async () => {
    const response = await fetch(`${baseUrl}/missing`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('cross-origin-resource-policy')).toBe(
      'same-origin'
    );
    expect(response.headers.get('x-powered-by')).toBeNull();
    expect(response.headers.get('cache-control')).toBeNull();
  });

  it('marks unknown /api routes as no-store', async () => {
    const response = await fetch(`${baseUrl}/api/missing`);

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('maps unexpected errors to a generic 500 body and logs the status only', () => {
    const deps = makeDeps();
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
    } as unknown as Response;

    createErrorHandler(toDeps(deps))(
      new Error('boom with secret detail'),
      {} as Request,
      response,
      vi.fn() as unknown as NextFunction
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ error: 'internal' });
    expect(deps.logger.entries).toEqual([
      { level: 'error', event: 'request_failed', status: 500 },
    ]);
  });
});
