import { AsyncLocalStorage } from 'node:async_hooks';

export interface MockDataContext {
  /** Whether this sync should write raw provider responses to mock_data/. */
  capture: boolean;
  /** 'local' replays a previously captured bundle instead of calling out. */
  dataSource?: string;
}

/**
 * Request-scoped mock-data options for the in-flight provider sync.
 *
 * `logRawResponse` is called from ~50 places across the provider integrations,
 * and the Garmin microservice call chain is several layers deep — none of which
 * know which sync they belong to. Rather than thread two values through every
 * one of them, each sync entry point marks its own async context and the leaves
 * read it, the same AsyncLocalStorage approach `db/poolManager` uses for the RLS
 * user context.
 *
 * The default is off, so a sync that never opts in writes nothing to disk and
 * always calls the real provider.
 */
const mockDataStorage = new AsyncLocalStorage<MockDataContext>();

/**
 * Marks the current sync's async context. Called once at the top of a provider
 * sync entry point, before any provider request is made, with the options the
 * route resolved via `resolveMockDataOptions` (which returns them disabled
 * unless an admin has turned on `mock_data_enabled`).
 */
export function setMockDataContext(options: {
  dataSource?: string | null;
  saveMockData?: boolean | null;
}): void {
  mockDataStorage.enterWith({
    capture: options.saveMockData === true,
    dataSource: options.dataSource ?? undefined,
  });
}

/** True when the in-flight sync asked for a mock bundle to be captured. */
export function isMockCaptureEnabled(): boolean {
  return mockDataStorage.getStore()?.capture === true;
}

/** The in-flight sync's data source, or undefined for the real provider. */
export function getMockDataSource(): string | undefined {
  return mockDataStorage.getStore()?.dataSource;
}
