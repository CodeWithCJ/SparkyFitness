import AsyncStorage from '@react-native-async-storage/async-storage';
import { readRecords, requestExerciseRoute } from 'react-native-health-connect';
import { prefetchSessionRoutes } from '../../../src/services/healthconnect/workoutTelemetry';
import {
  _resetEnrichedSessionCacheForTests,
  markEnrichedSessions,
} from '../../../src/services/shared/enrichedSessionCache';

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockReadRecords = readRecords as unknown as jest.Mock;
const mockRequestRoute = requestExerciseRoute as unknown as jest.Mock;

/**
 * prefetchSessionRoutes runs before the enrichment pass and outside its
 * telemetry budget. Unbounded, a year-long window pages through thousands of
 * sessions and serially resolves consent for each one — recreating the
 * foreground stall that bounding exists to prevent (#2191).
 */
describe('prefetchSessionRoutes is bounded', () => {
  const consentRequired = (i: number) => ({
    startTime: `2024-01-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00.000Z`,
    endTime: `2024-01-${String(1 + (i % 28)).padStart(2, '0')}T11:00:00.000Z`,
    exerciseRoute: { type: 'CONSENT_REQUIRED' },
    metadata: { id: `session-${i}`, lastModifiedTime: '2024-01-01T00:00:00.000Z' },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    _resetEnrichedSessionCacheForTests();
    await AsyncStorage.clear();
    mockReadRecords.mockResolvedValue({ records: [] });
    mockRequestRoute.mockResolvedValue([]);
  });

  test('stops at the limit instead of resolving consent for every session', async () => {
    mockReadRecords.mockResolvedValue({
      records: Array.from({ length: 200 }, (_, i) => consentRequired(i)),
    });

    await prefetchSessionRoutes(new Date('2024-01-01'), new Date('2024-02-01'), 5);

    // Exactly, not at most: an upper bound also passes if the implementation
    // resolved nothing, which would hide a prefetch that stopped too early.
    expect(mockRequestRoute).toHaveBeenCalledTimes(5);
  });

  test('the limit counts enrichment candidates, not consent requests', async () => {
    // enrichExerciseSessions claims a budget slot for EVERY valid uncached
    // session, whether or not it needs consent. Counting only issued requests
    // let the prefetch skip past the newest sessions (embedded route, or none)
    // without spending its limit, walk back to older ones, and prompt for
    // sessions enrichment would never reach.
    const withEmbeddedRoute = (i: number) => ({
      ...consentRequired(i),
      exerciseRoute: { type: 'DATA', route: [{ time: '2024-01-01T10:00:00.000Z', latitude: 1, longitude: 2 }] },
    });

    mockReadRecords.mockResolvedValue({
      records: [
        // Newest five already carry their route — candidates all the same.
        ...Array.from({ length: 5 }, (_, i) => withEmbeddedRoute(27 - i)),
        ...Array.from({ length: 20 }, (_, i) => consentRequired(i)),
      ],
    });

    await prefetchSessionRoutes(new Date('2024-01-01'), new Date('2024-02-01'), 5);

    // The five newest consumed the whole limit, so nothing older is prompted.
    expect(mockRequestRoute).not.toHaveBeenCalled();
  });

  test('sessions with an unusable window are not candidates', async () => {
    // Enrichment rejects these before claiming, so the prefetch must not spend
    // its limit on them either — otherwise the two walks diverge.
    const invalid = (i: number) => ({
      ...consentRequired(i),
      endTime: '2024-01-01T09:00:00.000Z',
      startTime: '2024-01-01T10:00:00.000Z',
    });

    mockReadRecords.mockResolvedValue({
      records: [
        ...Array.from({ length: 5 }, (_, i) => invalid(i)),
        ...Array.from({ length: 5 }, (_, i) => consentRequired(100 + i)),
      ],
    });

    await prefetchSessionRoutes(new Date('2024-01-01'), new Date('2024-02-01'), 5);

    expect(mockRequestRoute).toHaveBeenCalledTimes(5);
  });

  test('a zero limit resolves nothing at all', async () => {
    mockReadRecords.mockResolvedValue({ records: [consentRequired(0)] });

    await prefetchSessionRoutes(new Date('2024-01-01'), new Date('2024-02-01'), 0);

    expect(mockRequestRoute).not.toHaveBeenCalled();
  });

  test('spends the limit newest-first, matching enrichment claim order', async () => {
    mockReadRecords.mockResolvedValue({
      records: [consentRequired(0), consentRequired(5), consentRequired(20)],
    });

    await prefetchSessionRoutes(new Date('2024-01-01'), new Date('2024-02-01'), 1);

    expect(mockRequestRoute).toHaveBeenCalledTimes(1);
    expect(mockRequestRoute).toHaveBeenCalledWith('session-20');
  });

  test('skips sessions whose telemetry was already collected', async () => {
    const already = consentRequired(3);
    await markEnrichedSessions([
      `${already.metadata.id}:${already.metadata.lastModifiedTime}`,
    ]);
    mockReadRecords.mockResolvedValue({ records: [already] });

    await prefetchSessionRoutes(new Date('2024-01-01'), new Date('2024-02-01'), 5);

    // Enrichment will skip this session, so warming its route is wasted
    // consent work.
    expect(mockRequestRoute).not.toHaveBeenCalled();
  });
});
