import {
  loadWatchRunEntryIds,
  noteWatchRunEntry,
} from '../../../src/services/healthkit/watchRunEntries';
import {
  loadHealthPreference,
  saveHealthPreference,
} from '../../../src/services/healthkit/preferences';

jest.mock('../../../src/services/healthkit/preferences', () => ({
  loadHealthPreference: jest.fn(),
  saveHealthPreference: jest.fn(),
}));

let store: Record<string, unknown> = {};
beforeEach(() => {
  store = {};
  jest
    .mocked(loadHealthPreference)
    .mockImplementation((key: string) => Promise.resolve(store[key] ?? null));
  jest.mocked(saveHealthPreference).mockImplementation((key, value) => {
    store[key] = value;
    return Promise.resolve();
  });
});

describe('watch run entries', () => {
  it('remembers an entry once', async () => {
    await noteWatchRunEntry('e1');
    await noteWatchRunEntry('e1');
    expect([...(await loadWatchRunEntryIds())]).toEqual(['e1']);
  });

  it('keeps only the most recent entries', async () => {
    for (let i = 0; i < 505; i += 1) await noteWatchRunEntry(`e${i}`);
    const ids = await loadWatchRunEntryIds();
    expect(ids.size).toBe(500);
    expect(ids.has('e504')).toBe(true);
    expect(ids.has('e0')).toBe(false);
  });

  it('answers an empty set when nothing can be read', async () => {
    jest.mocked(loadHealthPreference).mockRejectedValue(new Error('storage'));
    expect((await loadWatchRunEntryIds()).size).toBe(0);
    await expect(noteWatchRunEntry('e1')).resolves.toBeUndefined();
  });
});
