import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { demoRestrictionGuard } from '../middleware/demoGuardMiddleware.js';

vi.mock('../db/poolManager.js', () => ({
  getSystemClient: vi.fn(),
  getClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

describe('demo account and the lab report scan', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = {
      ...original,
      SPARKY_FITNESS_DEMO_MODE: 'true',
      SPARKY_FITNESS_DEMO_EMAIL: 'demo@example.test',
    };
  });
  afterEach(() => {
    process.env = original;
  });

  const run = (email: string, path: string, baseUrl = '') => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    demoRestrictionGuard(
      {
        user: { email },
        baseUrl,
        path,
        method: 'POST',
        headers: {},
      } as unknown as Request,
      { status, json } as unknown as Response,
      next as NextFunction
    );
    return { status, json, next };
  };

  it('refuses the scan, which sends the document to the operator’s AI provider', () => {
    const { status, json, next } = run(
      'demo@example.test',
      '/scan',
      '/api/v2/lab-reports'
    );

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DEMO_UPLOAD_RESTRICTED' })
    );
  });

  it('lets any other account scan', () => {
    const { next } = run(
      'someone@example.test',
      '/scan',
      '/api/v2/lab-reports'
    );
    expect(next).toHaveBeenCalled();
  });
});
