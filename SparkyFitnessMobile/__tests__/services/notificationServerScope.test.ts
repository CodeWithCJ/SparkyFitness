import {
  belongsToOtherServer,
  currentServerId,
} from '../../src/services/notificationServerScope';
import { getActiveServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));

const mockGetActive = getActiveServerConfig as jest.Mock;

describe('notificationServerScope', () => {
  it('treats a different stamped server as another server', () => {
    expect(belongsToOtherServer('a', 'b')).toBe(true);
    expect(belongsToOtherServer('a', null)).toBe(true);
  });

  it('treats the active server or no stamp as this server', () => {
    expect(belongsToOtherServer('a', 'a')).toBe(false);
    expect(belongsToOtherServer(null, 'a')).toBe(false);
    expect(belongsToOtherServer(undefined, null)).toBe(false);
  });

  it('reads the active server id and falls back to null', async () => {
    mockGetActive.mockResolvedValueOnce({ id: 'a' });
    await expect(currentServerId()).resolves.toBe('a');
    mockGetActive.mockResolvedValueOnce(null);
    await expect(currentServerId()).resolves.toBeNull();
    mockGetActive.mockRejectedValueOnce(new Error('storage'));
    await expect(currentServerId()).resolves.toBeNull();
  });
});
