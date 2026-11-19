import { showOfflineUploadReminder } from '../../src/services/notifications';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { enqueueOutbox, getOutboxRow } from '../../src/offline/outbox';
import type { OfflineDb } from '../../src/offline/types';
import {
  WAITING_REMINDER_AFTER_MS,
  remindAboutLongWaitingUploads,
} from '../../src/offline/waitingReminder';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));
jest.mock('../../src/services/notifications', () => ({
  showOfflineUploadReminder: jest.fn(async () => true),
}));

const mockShow = showOfflineUploadReminder as jest.Mock;
const NOW = 100 * WAITING_REMINDER_AFTER_MS;

describe('reminding about a workout waiting a week', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  const queue = (id: string, createdAt: number) =>
    enqueueOutbox(
      db,
      {
        id,
        serverConfigId: 's1',
        userId: null,
        kind: 'workout_session.create',
        entityId: `w-${id}`,
        payload: {},
        payloadVersion: 1,
      },
      createdAt
    );

  it('says nothing before a week has passed', async () => {
    await queue('a', NOW - WAITING_REMINDER_AFTER_MS + 1000);

    await remindAboutLongWaitingUploads(NOW);

    expect(mockShow).not.toHaveBeenCalled();
  });

  it('reminds once after a week, and keeps the workout', async () => {
    await queue('a', NOW - WAITING_REMINDER_AFTER_MS);

    await remindAboutLongWaitingUploads(NOW);
    await remindAboutLongWaitingUploads(NOW + 1000);

    expect(mockShow).toHaveBeenCalledTimes(1);
    expect(await getOutboxRow(db, 'a')).toMatchObject({
      status: 'pending',
      remindedAt: NOW,
    });
  });

  it('tries again later when the reminder could not be shown', async () => {
    mockShow.mockResolvedValueOnce(false);
    await queue('a', NOW - WAITING_REMINDER_AFTER_MS);

    await remindAboutLongWaitingUploads(NOW);
    expect((await getOutboxRow(db, 'a'))?.remindedAt).toBeNull();

    await remindAboutLongWaitingUploads(NOW + 1000);
    expect(mockShow).toHaveBeenCalledTimes(2);
  });
});
