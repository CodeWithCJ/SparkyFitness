import { useWatchRouteStore } from '../../src/stores/watchRouteStore';

const reset = () =>
  useWatchRouteStore.setState({
    sent: {},
    reported: null,
    rejected: {},
    capacity: 10,
    reportedAt: 0,
  });

beforeEach(reset);

describe('watchRouteStore', () => {
  it('records what was sent and clears an earlier rejection', () => {
    useWatchRouteStore.setState({ rejected: { r1: 'full' } });
    useWatchRouteStore.getState().markSent('r1', 100);
    expect(useWatchRouteStore.getState().sent).toEqual({ r1: 100 });
    expect(useWatchRouteStore.getState().rejected).toEqual({});
  });

  it('forgets a removed route everywhere, including the last report', () => {
    useWatchRouteStore.setState({
      sent: { r1: 100, r2: 200 },
      reported: { r1: 100, r2: 200 },
      rejected: { r1: 'full' },
    });
    useWatchRouteStore.getState().markRemoved('r1');
    const state = useWatchRouteStore.getState();
    expect(state.sent).toEqual({ r2: 200 });
    expect(state.reported).toEqual({ r2: 200 });
    expect(state.rejected).toEqual({});
  });

  it('takes the watch report, with its capacity', () => {
    useWatchRouteStore.getState().applyReport({
      routes: [{ id: 'r1', updatedAt: 100 }],
      rejected: [{ id: 'r2', reason: 'full' }],
      capacity: 8,
      sentAt: 1000,
    });
    const state = useWatchRouteStore.getState();
    expect(state.reported).toEqual({ r1: 100 });
    expect(state.rejected).toEqual({ r2: 'full' });
    expect(state.capacity).toBe(8);
  });

  it('ignores a queued report older than the one it already has', () => {
    const { applyReport } = useWatchRouteStore.getState();
    applyReport({
      routes: [{ id: 'r1', updatedAt: 100 }],
      rejected: [],
      capacity: 10,
      sentAt: 2000,
    });
    applyReport({ routes: [], rejected: [], capacity: 10, sentAt: 1000 });
    expect(useWatchRouteStore.getState().reported).toEqual({ r1: 100 });
  });
});
