import { vi, type Mock } from 'vitest';

/**
 * A typed stand-in for the pg client these repository tests exercise. Only the two
 * methods the repositories actually call are exposed, so a test cannot lean on
 * something the real client would not provide.
 */
export interface MockDbClient {
  query: Mock;
  release: Mock;
}

export const createMockDbClient = (rows: unknown[] = [{}]): MockDbClient => ({
  query: vi.fn().mockResolvedValue({ rows }),
  release: vi.fn(),
});
