import { describe, it, expect } from 'vitest';
import {
  setMockDataContext,
  isMockCaptureEnabled,
  getMockDataSource,
} from '../utils/mockDataContext.js';

describe('mockDataContext', () => {
  it('reports capture off when no sync has set a context', () => {
    expect(isMockCaptureEnabled()).toBe(false);
    expect(getMockDataSource()).toBeUndefined();
  });

  it('exposes what the sync entry point set', async () => {
    await new Promise<void>((resolve) => {
      setMockDataContext({ dataSource: 'local', saveMockData: true });
      expect(isMockCaptureEnabled()).toBe(true);
      expect(getMockDataSource()).toBe('local');
      resolve();
    });
  });

  it('treats a null dataSource and an absent flag as off', async () => {
    await new Promise<void>((resolve) => {
      setMockDataContext({ dataSource: null });
      expect(isMockCaptureEnabled()).toBe(false);
      expect(getMockDataSource()).toBeUndefined();
      resolve();
    });
  });

  it('does not treat a truthy non-true flag as capture', async () => {
    await new Promise<void>((resolve) => {
      setMockDataContext({ saveMockData: undefined });
      expect(isMockCaptureEnabled()).toBe(false);
      resolve();
    });
  });
});
