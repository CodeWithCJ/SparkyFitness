import { Alert, type AlertButton } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import type { TFunction } from 'i18next';
import { putCacheRows } from '../../src/offline/cacheStore';
import { __setOfflineDbForTests } from '../../src/offline/db';
import {
  confirmLeavingServer,
  forgetServerOfflineData,
} from '../../src/offline/leaveServerGuard';
import {
  countUnconfirmedOutbox,
  enqueueOutbox,
} from '../../src/offline/outbox';
import type { OfflineDb } from '../../src/offline/types';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));

const t = ((key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key) as unknown as TFunction;

describe('leaving a server with uploads waiting', () => {
  let db: OfflineDb & { close(): void };
  let alert: jest.SpyInstance;

  beforeEach(async () => {
    db = await createTestDb();
    __setOfflineDbForTests(db);
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alert.mockRestore();
    __setOfflineDbForTests(null);
    db.close();
  });

  const queue = () =>
    enqueueOutbox(db, {
      id: 'row-1',
      serverConfigId: 's1',
      userId: null,
      kind: 'workout_session.create',
      entityId: 'w-1',
      payload: {},
      payloadVersion: 1,
    });

  const press = (label: string) => {
    const buttons = alert.mock.calls[0]![2] as AlertButton[];
    buttons.find((button) => button.text === label)!.onPress!();
  };

  it('goes ahead without asking when nothing is waiting', async () => {
    expect(await confirmLeavingServer('s1', 'switch', t)).toBe(true);
    expect(alert).not.toHaveBeenCalled();
  });

  it('asks, and switching anyway keeps the uploads on the phone', async () => {
    await queue();
    const answer = confirmLeavingServer('s1', 'switch', t);
    await waitFor(() => expect(alert).toHaveBeenCalled());

    press('Switch anyway');

    expect(await answer).toBe(true);
    expect(await countUnconfirmedOutbox(db, 's1')).toBe(1);
  });

  it('stops when the person cancels', async () => {
    await queue();
    const answer = confirmLeavingServer('s1', 'delete', t);
    await waitFor(() => expect(alert).toHaveBeenCalled());

    press('Cancel');

    expect(await answer).toBe(false);
  });

  it("removes a deleted server's saved data and uploads, and no other server's", async () => {
    await queue();
    await putCacheRows(db, 's1', 'exercise', [{ key: 'e', payload: {} }]);
    await putCacheRows(db, 's2', 'exercise', [{ key: 'e', payload: {} }]);

    await forgetServerOfflineData('s1');

    expect(await countUnconfirmedOutbox(db, 's1')).toBe(0);
    const left = await db.all<{ server_config_id: string }>(
      `SELECT server_config_id FROM cache`
    );
    expect(left).toEqual([{ server_config_id: 's2' }]);
  });
});
