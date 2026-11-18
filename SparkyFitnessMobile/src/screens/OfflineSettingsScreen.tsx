import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import Button from '../components/ui/Button';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { formatLocalizedNumber, getAppLocale } from '../localization';
import { clearCache } from '../offline/cacheStore';
import { getOfflineDb } from '../offline/db';
import { notifyOutboxChanged } from '../offline/events';
import {
  resolveWorkoutConflict,
  type ConflictChoice,
} from '../offline/conflicts';
import {
  clearOfflineImages,
  refreshOfflineImages,
  setExercisesKeptOffline,
} from '../offline/offlineImages';
import { refreshOfflinePack } from '../offline/offlinePack';
import Switch from '../components/ui/Switch';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { drainOutbox } from '../offline/syncEngine';
import type { OutboxRow, OutboxStatus } from '../offline/types';
import {
  WORKOUT_SESSION_UPDATE,
  type WorkoutSessionUpdatePayload,
} from '../offline/workoutHandOver';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { getActiveServerConfigId } from '../services/storage';
import { formatDate } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';

type OfflineSettingsScreenProps = RootStackScreenProps<'OfflineSettings'>;

const BYTES_PER_MB = 1024 * 1024;

/** "0.4 MB": megabytes to one decimal, in the app's number format. */
function formatMegabytes(bytes: number): string {
  return formatLocalizedNumber(bytes / BYTES_PER_MB, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function statusLabel(status: OutboxStatus, t: TFunction): string {
  switch (status) {
    case 'sending':
      return t('offline.status.sending', { defaultValue: 'Uploading…' });
    case 'conflict':
      return t('offline.status.conflict', {
        defaultValue: 'Changed somewhere else. Tap to choose.',
      });
    case 'needs_sign_in':
      return t('offline.status.needsSignIn', {
        defaultValue: 'Sign in again to upload',
      });
    case 'failed':
      return t('offline.status.failed', {
        defaultValue: 'The server did not accept it',
      });
    default:
      return t('offline.status.pending', {
        defaultValue: 'Waiting to upload',
      });
  }
}

/** What a waiting item is, in words. Unknown kinds get a neutral name. */
function kindLabel(row: OutboxRow, t: TFunction): string {
  if (row.kind.startsWith('workout_')) {
    return t('offline.kind.workout', { defaultValue: 'Workout' });
  }
  return t('offline.kind.other', { defaultValue: 'Saved change' });
}

const OfflineSettingsScreen: React.FC<OfflineSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { status, refetch } = useOfflineStatus();
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useRefetchOnFocus(refetch);

  const uploadNow = useCallback(async () => {
    setUploading(true);
    try {
      const summary = await drainOutbox('manual');
      if (summary.remaining === 0) {
        Toast.show({
          type: 'success',
          text1: t('offline.uploadDone', {
            defaultValue: 'Everything is uploaded',
          }),
        });
      } else {
        Toast.show({
          type: 'info',
          text1: t('offline.uploadStillWaiting', {
            defaultValue: 'Some items are still waiting',
          }),
          text2: t('offline.uploadStillWaitingDetail', {
            defaultValue:
              'They stay on this phone and upload when your server can be reached.',
          }),
        });
      }
    } finally {
      setUploading(false);
    }
  }, [t]);

  const refreshNow = useCallback(async () => {
    setRefreshing(true);
    try {
      const refreshed = await refreshOfflinePack({ force: true });
      Toast.show(
        refreshed
          ? {
              type: 'success',
              text1: t('offline.refreshDone', {
                defaultValue: 'Saved data is up to date',
              }),
            }
          : {
              type: 'error',
              text1: t('offline.refreshFailed', {
                defaultValue: 'Could not refresh',
              }),
              text2: t('offline.refreshFailedDetail', {
                defaultValue:
                  'Your server could not be reached. What is already saved is kept.',
              }),
            }
      );
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  const askConflictChoice = useCallback(
    (row: OutboxRow) => {
      const resolve = (choice: ConflictChoice) => {
        void resolveWorkoutConflict(row.id, choice, {
          phoneSuffix: t('offline.conflict.phoneSuffix', {
            defaultValue: '(phone)',
          }),
        });
      };
      const cancel = {
        text: t('common.cancel', { defaultValue: 'Cancel' }),
        style: 'cancel' as const,
      };
      // "Keep both" and "Save as new" copy the phone's whole workout. An edit
      // that changed only the name, notes or date holds none of the exercises,
      // so there is nothing to copy; the other choices still apply.
      const holdsWholeWorkout =
        row.kind !== WORKOUT_SESSION_UPDATE ||
        (row.payload as WorkoutSessionUpdatePayload).body?.exercises != null;
      if (row.lastError === 'deleted') {
        Alert.alert(
          t('offline.conflict.deletedTitle', {
            defaultValue: 'Deleted somewhere else',
          }),
          t('offline.conflict.deletedMessage', {
            defaultValue:
              'This workout was deleted on another device while this phone was offline.',
          }),
          [
            ...(holdsWholeWorkout
              ? [
                  {
                    text: t('offline.conflict.saveAsNew', {
                      defaultValue: 'Save as a new workout',
                    }),
                    onPress: () => resolve('saveSeparately'),
                  },
                ]
              : []),
            {
              text: t('offline.conflict.discard', {
                defaultValue: 'Discard this phone’s copy',
              }),
              style: 'destructive',
              onPress: () => resolve('keepServer'),
            },
            cancel,
          ]
        );
        return;
      }
      Alert.alert(
        t('offline.conflict.changedTitle', {
          defaultValue: 'Changed somewhere else',
        }),
        t('offline.conflict.changedMessage', {
          defaultValue:
            'This workout was changed on another device while this phone was offline. Which one do you want to keep?',
        }),
        [
          {
            text: t('offline.conflict.keepPhone', {
              defaultValue: 'Keep this phone’s workout',
            }),
            onPress: () => resolve('keepPhone'),
          },
          {
            text: t('offline.conflict.keepServer', {
              defaultValue: 'Keep the other version',
            }),
            onPress: () => resolve('keepServer'),
          },
          ...(holdsWholeWorkout
            ? [
                {
                  text: t('offline.conflict.saveSeparately', {
                    defaultValue: 'Keep both',
                  }),
                  onPress: () => resolve('saveSeparately'),
                },
              ]
            : []),
          cancel,
        ],
        // Android shows at most three buttons and drops the rest, so the
        // cancel button may not appear; back and a tap outside still close it.
        { cancelable: true }
      );
    },
    [t]
  );

  const picturesOnMobileData = useAppPreferencesStore(
    (state) => state.offlinePicturesOnMobileData
  );
  const setPicturesOnMobileData = useAppPreferencesStore(
    (state) => state.setOfflinePicturesOnMobileData
  );

  const stopKeeping = useCallback(async (exerciseId: string) => {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return;
    await setExercisesKeptOffline(serverConfigId, [exerciseId], false);
    notifyOutboxChanged();
    void refreshOfflineImages();
  }, []);

  const confirmClear = useCallback(() => {
    Alert.alert(
      t('offline.clearTitle', { defaultValue: 'Clear offline data?' }),
      t('offline.clearMessage', {
        defaultValue:
          'Saved workouts, exercises and other data kept for offline use are removed from this phone and downloaded again next time. Anything still waiting to upload is kept.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('offline.clearConfirm', { defaultValue: 'Clear' }),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const serverConfigId = await getActiveServerConfigId();
              if (!serverConfigId) return;
              await clearCache(await getOfflineDb(), serverConfigId);
              await clearOfflineImages(serverConfigId);
              notifyOutboxChanged();
            })();
          },
        },
      ]
    );
  }, [t]);

  const header = useScreenHeader({
    title: t('screens.offlineSettings', { defaultValue: 'Offline' }),
    left: { kind: 'back' },
  });

  const waitingCount = status.waiting.length;

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-sm text-text-secondary mb-4">
          {t('offline.intro', {
            defaultValue:
              'Workouts can be started and logged without a connection. They are kept on this phone and uploaded when your server can be reached.',
          })}
        </Text>

        <Text className="text-base font-semibold text-text-primary mb-2">
          {t('offline.waitingHeading', { defaultValue: 'Waiting to upload' })}
        </Text>
        <SettingsRowGroup>
          {waitingCount === 0 ? (
            <SettingsRow
              testID="offline-nothing-waiting"
              title={t('offline.nothingWaiting', {
                defaultValue: 'Nothing is waiting',
              })}
              subtitle={t('offline.nothingWaitingSubtitle', {
                defaultValue: 'Everything on this phone has been uploaded.',
              })}
            />
          ) : (
            status.waiting.map((row) => (
              <SettingsRow
                key={row.id}
                testID={`offline-waiting-${row.id}`}
                title={
                  row.entryDate
                    ? t('offline.waitingItem', {
                        defaultValue: '{{kind}}, {{date}}',
                        kind: kindLabel(row, t),
                        date: formatDate(row.entryDate, getAppLocale()),
                      })
                    : kindLabel(row, t)
                }
                subtitle={statusLabel(row.status, t)}
                subtitleNumberOfLines={0}
                onPress={
                  row.status === 'conflict'
                    ? () => askConflictChoice(row)
                    : undefined
                }
              />
            ))
          )}
        </SettingsRowGroup>
        {waitingCount > 0 && (
          <Button
            testID="offline-upload-now"
            variant="primary"
            className="mb-6"
            loading={uploading}
            onPress={() => void uploadNow()}
          >
            {t('offline.uploadNow', { defaultValue: 'Upload now' })}
          </Button>
        )}

        <Text className="text-base font-semibold text-text-primary mb-2 mt-2">
          {t('offline.storageHeading', { defaultValue: 'On this phone' })}
        </Text>
        <SettingsRowGroup>
          <SettingsRow
            testID="offline-storage"
            title={t('offline.storageTitle', {
              defaultValue: 'Saved for offline use',
            })}
            subtitle={t('offline.storageValue', {
              defaultValue: '{{size}} MB',
              size: formatMegabytes(status.cachedBytes),
            })}
          />
          <SettingsRow
            testID="offline-refresh"
            title={
              refreshing
                ? t('offline.refreshing', { defaultValue: 'Refreshing…' })
                : t('offline.refreshRow', { defaultValue: 'Refresh now' })
            }
            subtitle={
              status.lastRefreshedAt == null
                ? t('offline.neverRefreshed', {
                    defaultValue:
                      'Not downloaded yet. Connect to your server once to prepare offline workouts.',
                  })
                : t('offline.lastRefreshed', {
                    defaultValue: 'Last refreshed {{when}}',
                    when: new Date(status.lastRefreshedAt).toLocaleString(
                      getAppLocale(),
                      { dateStyle: 'medium', timeStyle: 'short' }
                    ),
                  })
            }
            subtitleNumberOfLines={0}
            disabled={refreshing}
            onPress={() => void refreshNow()}
          />
          <SettingsRow
            testID="offline-pictures"
            title={t('offline.picturesTitle', {
              defaultValue: 'Exercise pictures',
            })}
            subtitle={t('offline.storageValue', {
              defaultValue: '{{size}} MB',
              size: formatMegabytes(status.pictureBytes),
            })}
          />
          <SettingsRow
            title={t('offline.picturesOnMobileData', {
              defaultValue: 'Download pictures on mobile data',
            })}
            subtitle={t('offline.picturesOnMobileDataSubtitle', {
              defaultValue:
                'Off: pictures download on Wi-Fi only. Up to 300 MB.',
            })}
            subtitleNumberOfLines={0}
            rightAccessory={
              <Switch
                testID="offline-pictures-mobile-data"
                accessibilityLabel={t('offline.picturesOnMobileData', {
                  defaultValue: 'Download pictures on mobile data',
                })}
                value={picturesOnMobileData}
                onValueChange={setPicturesOnMobileData}
              />
            }
          />
          <SettingsRow
            testID="offline-clear"
            title={t('offline.clearRow', {
              defaultValue: 'Clear offline data',
            })}
            subtitle={t('offline.clearRowSubtitle', {
              defaultValue: 'Uploads still waiting are kept',
            })}
            onPress={confirmClear}
          />
        </SettingsRowGroup>

        <Text className="text-base font-semibold text-text-primary mb-2 mt-6">
          {t('offline.keptHeading', {
            defaultValue: 'Exercises kept offline',
          })}
        </Text>
        <Text className="text-sm text-text-secondary mb-2">
          {t('offline.keptIntro', {
            defaultValue:
              'Pictures of this week’s plan and your saved workouts are kept automatically. To keep more, long-press exercises in the exercise library.',
          })}
        </Text>
        {status.keptExercises.length > 0 && (
          <SettingsRowGroup>
            {status.keptExercises.map((exercise) => (
              <SettingsRow
                key={exercise.id}
                testID={`offline-kept-${exercise.id}`}
                title={exercise.name}
                subtitle={t('offline.keptRemove', {
                  defaultValue: 'Tap to stop keeping offline',
                })}
                onPress={() => void stopKeeping(exercise.id)}
              />
            ))}
          </SettingsRowGroup>
        )}
      </ScrollView>
    </View>
  );
};

export default OfflineSettingsScreen;
