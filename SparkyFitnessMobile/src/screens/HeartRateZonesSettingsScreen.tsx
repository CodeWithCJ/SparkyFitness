import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import {
  HR_ZONE_COUNT,
  HR_ZONE_METHODS,
  MAX_MAX_HR,
  MAX_RESTING_HR,
  MIN_MAX_HR,
  MIN_RESTING_HR,
  customFloorsProblem,
  heartRateDisplayBands,
  type HeartRateZonesResponse,
  type HrZoneDisplayCount,
  type HrZoneMethod,
} from '@workspace/shared';

import SegmentedControl from '../components/SegmentedControl';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  useHeartRateZones,
  useUpdateHeartRateZones,
} from '../hooks/useHeartRateZones';
import { addLog } from '../services/LogService';
import {
  appleHeartZonesAvailable,
  readAppleHeartRateZones,
} from '../services/appleHeartZones';
import { formatLocalizedNumber } from '../localization';
import {
  displayBandLabel,
  maxHrSourceLabel,
  methodName,
} from '../utils/heartRateZoneLabels';
import type { RootStackScreenProps } from '../types/navigation';

type HeartRateZonesSettingsScreenProps =
  RootStackScreenProps<'HeartRateZonesSettings'>;

/** Easy to hard, zone 1 to 5; the same colors the zone charts use. */
const digitsOnly = (text: string): string =>
  text.replace(/[^0-9]/g, '').slice(0, 3);

const parseWhole = (text: string): number | null =>
  text === '' ? null : Number(text);

interface Draft {
  maxHr: string;
  restingHr: string;
  method: HrZoneMethod;
  floors: string[];
  displayZones: HrZoneDisplayCount;
}

const draftFrom = (data: HeartRateZonesResponse): Draft => ({
  maxHr: data.settings.max_heart_rate?.toString() ?? '',
  restingHr: data.settings.resting_heart_rate?.toString() ?? '',
  method: data.settings.method,
  displayZones: data.settings.display_zones,
  // Start custom zones from the zones in use, so switching to Custom edits
  // what the person already sees instead of an empty form.
  floors:
    data.settings.custom_floors?.map(String) ??
    data.resolved.zones.map((zone) => String(zone.lower_bpm)),
});

const HeartRateZonesSettingsScreen: React.FC<
  HeartRateZonesSettingsScreenProps
> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { zones, isLoading, isError, refetch } = useHeartRateZones();
  const update = useUpdateHeartRateZones();
  const [accent, textPrimary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
  ]) as [string, string];

  // What the person has typed; null until they change something, so the form
  // shows the saved settings (including once they arrive or are saved).
  const [edits, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const draft = edits ?? (zones ? draftFrom(zones) : null);
  // The Health permission sheet can sit up for a while. Read the form as it
  // is when the answer comes back, not as it was when the button was pressed.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const importingRef = useRef(false);
  const canImportApple = appleHeartZonesAvailable();

  const dirty =
    zones != null &&
    edits != null &&
    JSON.stringify(edits) !== JSON.stringify(draftFrom(zones));

  const save = () => {
    if (!draft) return;
    const maxHeartRate = parseWhole(draft.maxHr);
    const restingHeartRate = parseWhole(draft.restingHr);
    if (
      maxHeartRate != null &&
      (maxHeartRate < MIN_MAX_HR || maxHeartRate > MAX_MAX_HR)
    ) {
      setError(
        t('heartRateZones.errors.maxRange', {
          min: MIN_MAX_HR,
          max: MAX_MAX_HR,
          defaultValue:
            'Max heart rate must be between {{min}} and {{max}} bpm.',
        })
      );
      return;
    }
    if (
      restingHeartRate != null &&
      (restingHeartRate < MIN_RESTING_HR || restingHeartRate > MAX_RESTING_HR)
    ) {
      setError(
        t('heartRateZones.errors.restingRange', {
          min: MIN_RESTING_HR,
          max: MAX_RESTING_HR,
          defaultValue:
            'Resting heart rate must be between {{min}} and {{max}} bpm.',
        })
      );
      return;
    }
    if (draft.method === 'heart_rate_reserve' && restingHeartRate == null) {
      setError(
        t('heartRateZones.errors.needsResting', {
          defaultValue: 'Heart rate reserve zones need a resting heart rate.',
        })
      );
      return;
    }
    const customFloors = draft.floors.map((floor) => Number(floor));
    if (draft.method === 'custom' && customFloorsProblem(customFloors)) {
      setError(
        t('heartRateZones.errors.customFloors', {
          defaultValue:
            'Each zone must start above the one before it, from 30 to 250 bpm.',
        })
      );
      return;
    }
    setError(null);
    update.mutate(
      {
        max_heart_rate: maxHeartRate,
        resting_heart_rate: restingHeartRate,
        method: draft.method,
        display_zones: draft.displayZones,
        ...(draft.method === 'custom' ? { custom_floors: customFloors } : {}),
      },
      {
        onSuccess: () => {
          setDraft(null);
          Toast.show({
            type: 'success',
            text1: t('heartRateZones.saved', {
              defaultValue: 'Heart rate zones saved',
            }),
          });
        },
        onError: (saveError) => {
          addLog('Failed to save heart rate zones', 'ERROR', [
            String(saveError),
          ]);
          setError(
            t('heartRateZones.errors.saveFailed', {
              defaultValue: 'Could not save. Check the values and try again.',
            })
          );
        },
      }
    );
  };

  const importApple = async () => {
    const current = draftRef.current;
    if (!current || importingRef.current) return;
    importingRef.current = true;
    setImporting(true);
    setError(null);
    try {
      const imported = await readAppleHeartRateZones({
        includeRestingHeartRate: current.restingHr === '',
      });
      if (!imported) {
        setError(
          t('heartRateZones.appleFailed', {
            defaultValue:
              "Apple Health didn't share five heart rate zones. Check that Health access is allowed, then try again.",
          })
        );
        return;
      }
      const latest = draftRef.current ?? current;
      setDraft({
        ...latest,
        method: 'custom',
        floors: imported.floors.map(String),
        restingHr:
          latest.restingHr !== ''
            ? latest.restingHr
            : imported.restingHeartRate != null
              ? String(imported.restingHeartRate)
              : latest.restingHr,
      });
      Toast.show({
        type: 'success',
        text1: t('heartRateZones.appleImported', {
          defaultValue: 'Apple Health zones filled in. Save to keep them.',
        }),
      });
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  };

  const reset = () => {
    setError(null);
    update.mutate(
      { reset: true },
      {
        onSuccess: () => setDraft(null),
        onError: (resetError) =>
          addLog('Failed to reset heart rate zones', 'ERROR', [
            String(resetError),
          ]),
      }
    );
  };

  const header = useScreenHeader({
    title: t('heartRateZones.title', { defaultValue: 'Heart Rate Zones' }),
    left: { kind: 'back' },
    right: {
      kind: 'primary',
      busy: update.isPending,
      disabled: !dirty || update.isPending,
      onPress: save,
    },
  });

  const numberInput = (
    testID: string,
    label: string,
    value: string,
    onChange: (next: string) => void,
    placeholder?: string
  ) => (
    <TextInput
      testID={testID}
      accessibilityLabel={label}
      value={value}
      placeholder={placeholder}
      onChangeText={(text) => onChange(digitsOnly(text))}
      keyboardType="number-pad"
      selectTextOnFocus
      className="bg-raised rounded-lg text-center font-semibold"
      style={{
        width: 80,
        height: 40,
        paddingVertical: 0,
        fontSize: 16,
        lineHeight: 16,
        color: textPrimary,
      }}
    />
  );

  const resolved = zones?.resolved;
  const displaySegments = [
    {
      key: '5',
      label: t('heartRateZones.display.five', { defaultValue: '5 zones' }),
    },
    {
      key: '4',
      label: t('heartRateZones.display.four', { defaultValue: '4 tiers' }),
    },
  ];
  const methodSegments = HR_ZONE_METHODS.map((method) => ({
    key: method,
    label: methodName(t, method),
  }));

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-4">
          {t('heartRateZones.description', {
            defaultValue:
              'Your zones decide how time in each heart rate zone is counted for new workouts, how training load is judged and what ranges are suggested for runs.',
          })}
        </Text>

        {isLoading ? (
          <ActivityIndicator color={accent} />
        ) : isError || !resolved || !draft ? (
          <Pressable
            testID="heart-rate-zones-retry"
            accessibilityRole="button"
            onPress={() => refetch()}
            className="bg-surface rounded-xl p-4 items-center"
          >
            <Text className="text-text-primary">
              {t('heartRateZones.loadFailed', {
                defaultValue: 'Could not load your zones. Tap to retry.',
              })}
            </Text>
          </Pressable>
        ) : (
          <>
            <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
              <Text className="text-base font-semibold text-text-primary">
                {t('heartRateZones.yourZones', { defaultValue: 'Your zones' })}
              </Text>
              <Text
                testID="heart-rate-zones-max-source"
                className="text-sm text-text-secondary mt-0.5 mb-3"
              >
                {t('heartRateZones.maxHrSummary', {
                  max: formatLocalizedNumber(resolved.max_hr),
                  source: maxHrSourceLabel(t, resolved.max_hr_source),
                  defaultValue: 'Max heart rate {{max}} bpm. {{source}}.',
                })}
              </Text>
              {heartRateDisplayBands(
                resolved.zones.map((zone) => ({
                  zone: zone.zone,
                  lowerBpm: zone.lower_bpm,
                  upperBpm: zone.upper_bpm,
                })),
                draft.displayZones
              ).map((band) => (
                <View
                  key={band.index}
                  testID={`heart-rate-zone-${band.index}`}
                  className="flex-row items-center justify-between py-2 border-t border-border-subtle"
                >
                  <View className="flex-row items-center">
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: band.color,
                        marginRight: 10,
                      }}
                    />
                    <Text className="text-text-primary text-base">
                      {displayBandLabel(t, band)}
                    </Text>
                  </View>
                  <Text className="text-text-secondary text-base">
                    {band.upperBpm == null
                      ? t('heartRateZones.zoneRangeOpen', {
                          lower: formatLocalizedNumber(band.lowerBpm),
                          defaultValue: '{{lower}}+ bpm',
                        })
                      : t('heartRateZones.zoneRange', {
                          lower: formatLocalizedNumber(band.lowerBpm),
                          upper: formatLocalizedNumber(band.upperBpm),
                          defaultValue: '{{lower}}–{{upper}} bpm',
                        })}
                  </Text>
                </View>
              ))}
              {resolved.method !== resolved.effective_method ? (
                <Text
                  testID="heart-rate-zones-fallback"
                  className="text-xs text-text-muted mt-2"
                >
                  {t('heartRateZones.fellBack', {
                    defaultValue:
                      'Your chosen method needs more information, so zones are shown as % of max heart rate.',
                  })}
                </Text>
              ) : null}
            </View>

            <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
              <Text className="text-base font-semibold text-text-primary mb-3">
                {t('heartRateZones.method.title', {
                  defaultValue: 'How zones are worked out',
                })}
              </Text>
              <SegmentedControl
                segments={methodSegments}
                activeKey={draft.method}
                onSelect={(method) => setDraft({ ...draft, method })}
              />
              <Text className="text-sm text-text-secondary mt-3">
                {draft.method === 'heart_rate_reserve'
                  ? t('heartRateZones.method.heartRateReserveHint', {
                      defaultValue:
                        'Zones are 50, 60, 70, 80 and 90% of the gap between your resting and max heart rate (Karvonen). Needs a resting heart rate.',
                    })
                  : draft.method === 'custom'
                    ? t('heartRateZones.method.customHint', {
                        defaultValue:
                          'Set the bpm where each zone starts. Time below zone 1 is not counted.',
                      })
                    : t('heartRateZones.method.percentMaxHint', {
                        defaultValue:
                          'Zones start at 50, 60, 70, 80 and 90% of your max heart rate.',
                      })}
              </Text>
            </View>

            <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
              <Text className="text-base font-semibold text-text-primary mb-3">
                {t('heartRateZones.display.title', {
                  defaultValue: 'Show',
                })}
              </Text>
              <SegmentedControl
                segments={displaySegments}
                activeKey={String(draft.displayZones)}
                onSelect={(key) =>
                  setDraft({ ...draft, displayZones: key === '4' ? 4 : 5 })
                }
              />
              <Text className="text-sm text-text-secondary mt-3">
                {t('heartRateZones.display.hint', {
                  defaultValue:
                    'Four tiers are Light (zones 1 and 2), Moderate (zone 3), Vigorous (zone 4) and Peak (zone 5). Only what you see changes: zones are still worked out and stored as five.',
                })}
              </Text>
            </View>

            <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
              <View className="flex-row items-center justify-between">
                <Text className="text-base text-text-primary">
                  {t('heartRateZones.maxHr', {
                    defaultValue: 'Max heart rate (bpm)',
                  })}
                </Text>
                {numberInput(
                  'heart-rate-zones-max-input',
                  t('heartRateZones.maxHr', {
                    defaultValue: 'Max heart rate (bpm)',
                  }),
                  draft.maxHr,
                  (maxHr) => setDraft({ ...draft, maxHr }),
                  String(resolved.max_hr)
                )}
              </View>
              <Text className="text-xs text-text-muted mt-1 mb-3">
                {t('heartRateZones.maxHrHint', {
                  defaultValue:
                    'Leave empty to work it out from your date of birth.',
                })}
              </Text>
              <View className="flex-row items-center justify-between">
                <Text className="text-base text-text-primary">
                  {t('heartRateZones.restingHr', {
                    defaultValue: 'Resting heart rate (bpm)',
                  })}
                </Text>
                {numberInput(
                  'heart-rate-zones-resting-input',
                  t('heartRateZones.restingHr', {
                    defaultValue: 'Resting heart rate (bpm)',
                  }),
                  draft.restingHr,
                  (restingHr) => setDraft({ ...draft, restingHr })
                )}
              </View>
            </View>

            {draft.method === 'custom' ? (
              <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
                <Text className="text-base font-semibold text-text-primary mb-2">
                  {t('heartRateZones.customFloors', {
                    defaultValue: 'Where each zone starts (bpm)',
                  })}
                </Text>
                {Array.from({ length: HR_ZONE_COUNT }, (_, index) => (
                  <View
                    key={index}
                    className="flex-row items-center justify-between py-1.5"
                  >
                    <Text className="text-text-primary text-base">
                      {t('exerciseStatistics.cardio.zone', {
                        defaultValue: 'Zone {{zone}}',
                        zone: index + 1,
                      })}
                    </Text>
                    {numberInput(
                      `heart-rate-zones-floor-${index + 1}`,
                      t('heartRateZones.floorLabel', {
                        defaultValue: 'Zone {{zone}} starts at (bpm)',
                        zone: index + 1,
                      }),
                      draft.floors[index] ?? '',
                      (next) =>
                        setDraft({
                          ...draft,
                          floors: draft.floors.map((floor, i) =>
                            i === index ? next : floor
                          ),
                        })
                    )}
                  </View>
                ))}
              </View>
            ) : null}

            {error ? (
              <Text
                testID="heart-rate-zones-error"
                className="text-sm mb-3"
                style={{ color: '#ef4444' }}
              >
                {error}
              </Text>
            ) : null}

            <Text className="text-xs text-text-muted mb-2">
              {t('heartRateZones.historyNote', {
                defaultValue:
                  'Changes apply to workouts you record or sync from now on. Time in zone already stored for past workouts is not recalculated.',
              })}
            </Text>

            {canImportApple ? (
              <>
                <Pressable
                  testID="heart-rate-zones-apple"
                  accessibilityRole="button"
                  disabled={importing || update.isPending}
                  onPress={() => {
                    void importApple();
                  }}
                  className="py-3 items-center active:opacity-70"
                >
                  <Text
                    className="text-base font-semibold"
                    style={{ color: accent }}
                  >
                    {importing
                      ? t('heartRateZones.appleReading', {
                          defaultValue: 'Reading Apple Health…',
                        })
                      : t('heartRateZones.appleImport', {
                          defaultValue: 'Use Apple Health zones',
                        })}
                  </Text>
                </Pressable>
                <Text className="text-xs text-text-muted mb-2">
                  {t('heartRateZones.appleHint', {
                    defaultValue:
                      'Fills in the zones from Apple Health as custom zones. Your max heart rate stays as it is, and an empty resting heart rate is filled in too. Save to keep them.',
                  })}
                </Text>
              </>
            ) : null}

            <Pressable
              testID="heart-rate-zones-reset"
              accessibilityRole="button"
              disabled={update.isPending}
              onPress={reset}
              className="mt-2 py-3 items-center active:opacity-70"
            >
              <Text
                className="text-base font-semibold"
                style={{ color: accent }}
              >
                {t('heartRateZones.reset', {
                  defaultValue: 'Reset to default',
                })}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
};

export default HeartRateZonesSettingsScreen;
