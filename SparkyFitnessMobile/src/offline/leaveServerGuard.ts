import { Alert } from 'react-native';
import type { TFunction } from 'i18next';
import { addLog } from '../services/LogService';
import { getOfflineDb } from './db';
import { clearOfflineImages } from './offlineImages';
import { notifyOutboxChanged } from './events';
import { listUnconfirmedOutbox } from './outbox';
import { uploadsToShow } from './workoutHandOver';
import { drainOutbox } from './syncEngine';

async function waitingCount(serverConfigId: string): Promise<number> {
  try {
    const rows = await listUnconfirmedOutbox(
      await getOfflineDb(),
      serverConfigId
    );
    return uploadsToShow(rows).length;
  } catch {
    return 0;
  }
}

/**
 * Asks before leaving a server that still has uploads waiting on this phone.
 *
 * - `switch`: the uploads stay on this phone and go up when the person comes
 *   back to that server.
 * - `delete`: the server's settings are removed, so they could never be
 *   sent; leaving means losing them.
 *
 * Resolves true when the caller may go ahead. "Upload first" tries at once
 * and only goes ahead once nothing is left waiting.
 */
export async function confirmLeavingServer(
  serverConfigId: string,
  reason: 'switch' | 'delete',
  t: TFunction
): Promise<boolean> {
  const count = await waitingCount(serverConfigId);
  if (count === 0) return true;

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      t('offline.leave.title', {
        count,
        defaultValue: '{{count}} workouts are waiting to upload',
        defaultValue_one: '{{count}} workout is waiting to upload',
        defaultValue_other: '{{count}} workouts are waiting to upload',
      }),
      reason === 'delete'
        ? t('offline.leave.deleteMessage', {
            defaultValue:
              'Removing this server also removes what is waiting on this phone, and it will never reach the server.',
          })
        : t('offline.leave.switchMessage', {
            defaultValue:
              'They stay on this phone and upload when you switch back to this server.',
          }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: t('offline.leave.uploadFirst', {
            defaultValue: 'Upload first',
          }),
          onPress: () => {
            void (async () => {
              await drainOutbox('manual');
              const left = await waitingCount(serverConfigId);
              if (left === 0) {
                resolve(true);
                return;
              }
              Alert.alert(
                t('offline.uploadStillWaiting', {
                  defaultValue: 'Some items are still waiting',
                }),
                t('offline.uploadStillWaitingDetail', {
                  defaultValue:
                    'They stay on this phone and upload when your server can be reached.',
                })
              );
              resolve(false);
            })();
          },
        },
        {
          text:
            reason === 'delete'
              ? t('offline.leave.deleteAnyway', {
                  defaultValue: 'Remove anyway',
                })
              : t('offline.leave.switchAnyway', {
                  defaultValue: 'Switch anyway',
                }),
          style: reason === 'delete' ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ]
    );
  });
}

/** Removes everything this phone keeps for a server that was deleted. */
export async function forgetServerOfflineData(
  serverConfigId: string
): Promise<void> {
  try {
    // Files first: the rows are what says where they are.
    await clearOfflineImages(serverConfigId);
    const db = await getOfflineDb();
    await db.transaction(async (tx) => {
      await tx.run(`DELETE FROM cache WHERE server_config_id = ?`, [
        serverConfigId,
      ]);
      await tx.run(`DELETE FROM outbox WHERE server_config_id = ?`, [
        serverConfigId,
      ]);
      await tx.run(`DELETE FROM offline_keep WHERE server_config_id = ?`, [
        serverConfigId,
      ]);
    });
    notifyOutboxChanged();
  } catch (error) {
    addLog(`[Offline] Could not remove a server's data: ${error}`, 'WARNING');
  }
}
