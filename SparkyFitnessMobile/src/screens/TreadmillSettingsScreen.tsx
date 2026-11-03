import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import FormInput from '../components/FormInput';
import SegmentedControl from '../components/SegmentedControl';
import SettingsRow from '../components/SettingsRow';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { formatLocalizedNumber } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import {
  getWatchIndoorScaleProfile,
  onWatchIndoorScaleChange,
  resetWatchIndoorScale,
} from '../services/watchIndoorScale';
import type { LearnedScale } from '../utils/indoorDistanceScale';
import {
  getStrideProfile,
  resetStride,
  setStride,
  type StrideInfo,
} from '../services/strideCalibration';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { METERS_PER_KM, METERS_PER_MILE } from '../utils/gpsRecording';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import {
  calibrateFromKnownDistance,
  isPlausibleStride,
  strideFromDisplay,
  strideToDisplay,
  type StepActivity,
} from '../utils/stride';
import {
  clampTreadmillPercent,
  correctTreadmillDistance,
  MAX_TREADMILL_PERCENT,
} from '../utils/treadmillCorrection';
import { formatTreadmillPercent } from '../utils/treadmillCorrectionFormat';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'TreadmillSettings'>;

type Direction = 'long' | 'short';

const ACTIVITIES: StepActivity[] = ['walk', 'run'];

const decimal = (value: number, digits: number) =>
  formatLocalizedNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** Typed text for an input: nothing while empty, NaN when malformed. */
const parseField = (text: string): number | null =>
  text.trim() === '' ? null : parseDecimalInput(text);

const TreadmillSettingsScreen: React.FC<Props> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { preferences } = usePreferences();
  const miles = preferences?.default_distance_unit === 'miles';
  const unit: 'km' | 'miles' = miles ? 'miles' : 'km';
  const unitMeters = miles ? METERS_PER_MILE : METERS_PER_KM;
  const unitLabel = miles
    ? t('recordActivity.unitMi', { defaultValue: 'mi' })
    : t('recordActivity.unitKm', { defaultValue: 'km' });
  const strideUnitLabel = miles
    ? t('treadmillSettings.unitFeet', { defaultValue: 'ft' })
    : t('treadmillSettings.unitMeters', { defaultValue: 'm' });
  const strideDigits = 2;

  const header = useScreenHeader({
    title: t('treadmillSettings.title', { defaultValue: 'Treadmill & Stride' }),
    left: { kind: 'back' },
  });

  const enabled = useAppPreferencesStore((s) => s.treadmillCorrectionEnabled);
  const percent = useAppPreferencesStore((s) => s.treadmillCorrectionPercent);
  const setEnabled = useAppPreferencesStore(
    (s) => s.setTreadmillCorrectionEnabled
  );
  const setPercent = useAppPreferencesStore(
    (s) => s.setTreadmillCorrectionPercent
  );

  // The direction is its own control because a decimal keypad has no minus
  // key; the stored percent carries the sign.
  const [direction, setDirection] = useState<Direction>(
    percent < 0 ? 'short' : 'long'
  );
  const [percentText, setPercentText] = useState(
    percent === 0 ? '' : String(Math.abs(percent))
  );
  const commitPercent = (nextDirection: Direction, text: string) => {
    const magnitude = parseField(text);
    if (magnitude === null) {
      setPercent(0);
      return;
    }
    if (!Number.isFinite(magnitude)) return;
    setPercent(nextDirection === 'short' ? -magnitude : magnitude);
  };
  const preview = correctTreadmillDistance(5 * unitMeters, {
    enabled: true,
    percent,
  });

  const [profile, setProfile] = useState<Record<
    StepActivity,
    StrideInfo
  > | null>(null);
  const reload = useCallback(async () => {
    setProfile(await getStrideProfile());
  }, []);
  useEffect(() => {
    let active = true;
    void getStrideProfile().then((loaded) => {
      if (active) setProfile(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  // What the watch has learned about its own indoor distance. It changes when
  // a run is corrected, so this follows the store rather than loading once.
  const [watchScale, setWatchScale] = useState<Record<
    StepActivity,
    LearnedScale | null
  > | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => {
      void getWatchIndoorScaleProfile().then((loaded) => {
        if (active) setWatchScale(loaded);
      });
    };
    load();
    const unsubscribe = onWatchIndoorScaleChange(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const watchScaleStatus = (info: LearnedScale | null) =>
    info
      ? t('treadmillSettings.watchScaleLearned', {
          count: info.samples,
          factor: decimal(info.scale, 3),
          percent: formatTreadmillPercent((info.scale - 1) * 100),
          defaultValue_one:
            'The watch’s distance is multiplied by {{factor}} ({{percent}}). Learned from {{count}} correction.',
          defaultValue_other:
            'The watch’s distance is multiplied by {{factor}} ({{percent}}). Learned from {{count}} corrections.',
          defaultValue:
            'The watch’s distance is multiplied by {{factor}} ({{percent}}). Learned from {{count}} corrections.',
        })
      : t('treadmillSettings.watchScaleNone', {
          defaultValue:
            'Not learned yet. It learns when you enter the distance a treadmill showed after a watch run.',
        });

  const [strideText, setStrideText] = useState<Record<StepActivity, string>>({
    walk: '',
    run: '',
  });
  const [strideError, setStrideError] = useState<StepActivity | null>(null);
  const saveStride = async (activity: StepActivity) => {
    const typed = parseField(strideText[activity]);
    const meters =
      typed === null || !Number.isFinite(typed)
        ? NaN
        : strideFromDisplay(typed, unit);
    if (!isPlausibleStride(meters) || !(await setStride(activity, meters))) {
      setStrideError(activity);
      return;
    }
    setStrideError(null);
    setStrideText((current) => ({ ...current, [activity]: '' }));
    await reload();
  };
  const reset = async (activity: StepActivity) => {
    setStrideError(null);
    await resetStride(activity);
    await reload();
  };

  const [calActivity, setCalActivity] = useState<StepActivity>('run');
  const [calSteps, setCalSteps] = useState('');
  const [calDistance, setCalDistance] = useState('');
  const [calShown, setCalShown] = useState('');
  const [calResult, setCalResult] = useState<{
    activity: StepActivity;
    strideMeters: number;
    treadmillPercent: number | null;
  } | null>(null);
  const [calFailed, setCalFailed] = useState(false);
  const calibrate = async () => {
    setCalResult(null);
    const steps = parseField(calSteps);
    const distance = parseField(calDistance);
    const shown = parseField(calShown);
    const result =
      steps !== null &&
      distance !== null &&
      Number.isFinite(steps) &&
      Number.isFinite(distance) &&
      (shown === null || Number.isFinite(shown))
        ? calibrateFromKnownDistance(
            steps,
            distance * unitMeters,
            shown === null ? null : shown * unitMeters
          )
        : null;
    if (!result || !(await setStride(calActivity, result.strideMeters))) {
      setCalFailed(true);
      return;
    }
    setCalFailed(false);
    setCalResult({ activity: calActivity, ...result });
    await reload();
  };
  const applyMeasuredPercent = (measured: number) => {
    const next = clampTreadmillPercent(measured);
    setEnabled(true);
    setPercent(next);
    setDirection(next < 0 ? 'short' : 'long');
    setPercentText(next === 0 ? '' : String(Math.abs(next)));
  };

  const activityName = (activity: StepActivity) =>
    activity === 'walk'
      ? t('treadmillSettings.walkingStride', { defaultValue: 'Walking stride' })
      : t('treadmillSettings.runningStride', {
          defaultValue: 'Running stride',
        });

  const status = (info: StrideInfo) => {
    if (info.manual) {
      return t('treadmillSettings.strideManual', {
        defaultValue: 'Set by you. New distances nudge it from here.',
      });
    }
    if (info.samples > 0) {
      return t('treadmillSettings.strideLearned', {
        count: info.samples,
        defaultValue_one: 'Learned from {{count}} real distance.',
        defaultValue_other: 'Learned from {{count}} real distances.',
        defaultValue: 'Learned from {{count}} real distances.',
      });
    }
    return t('treadmillSettings.strideDefault', {
      defaultValue:
        'Default stride. Not learned yet: it learns when you enter the distance a treadmill showed after a run, or set it below.',
    });
  };

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
        <SettingsRow
          title={t('treadmillSettings.correction', {
            defaultValue: 'Correct treadmill distance',
          })}
          subtitle={t('treadmillSettings.correctionSubtitle', {
            defaultValue:
              'If your treadmill display reads long or short, take that off the distance you enter from it. Distances the phone estimates from steps are not changed. Kept on this device.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              accessibilityLabel={t('treadmillSettings.correctionA11y', {
                defaultValue: 'Correct treadmill distance',
              })}
            />
          }
        />

        {enabled ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-base font-bold mb-2">
              {t('treadmillSettings.displayReads', {
                defaultValue: 'My treadmill display reads',
              })}
            </Text>
            <SegmentedControl<Direction>
              segments={[
                {
                  key: 'long',
                  label: t('treadmillSettings.readsLong', {
                    defaultValue: 'Long',
                  }),
                },
                {
                  key: 'short',
                  label: t('treadmillSettings.readsShort', {
                    defaultValue: 'Short',
                  }),
                },
              ]}
              activeKey={direction}
              onSelect={(next) => {
                setDirection(next);
                commitPercent(next, percentText);
              }}
            />
            <View className="flex-row items-center mt-3">
              <FormInput
                className="flex-1"
                keyboardType="decimal-pad"
                value={percentText}
                placeholder="0"
                accessibilityLabel={t('treadmillSettings.percentA11y', {
                  defaultValue: 'Percent the treadmill reads off',
                })}
                onChangeText={(text) => {
                  if (text !== '' && !DECIMAL_INPUT_REGEX.test(text)) return;
                  setPercentText(text);
                  commitPercent(direction, text);
                }}
              />
              <Text className="text-text-secondary text-base ml-3">%</Text>
            </View>
            <Text className="text-text-secondary text-sm mt-2">
              {preview.applied
                ? t('treadmillSettings.preview', {
                    defaultValue:
                      'A display of {{shown}} {{unit}} is saved as {{saved}} {{unit}} ({{percent}}).',
                    shown: decimal(5, 2),
                    saved: decimal(preview.correctedMeters / unitMeters, 2),
                    unit: unitLabel,
                    percent: formatTreadmillPercent(percent),
                  })
                : t('treadmillSettings.previewNone', {
                    defaultValue:
                      'Enter how far off it is, up to {{max}} percent. At 0 nothing changes.',
                    max: MAX_TREADMILL_PERCENT,
                  })}
            </Text>
          </View>
        ) : null}

        <View className="bg-surface rounded-xl p-4 mb-4" testID="watch-scale">
          <Text className="text-text-primary text-base font-bold">
            {t('treadmillSettings.watchScale', {
              defaultValue: 'Watch treadmill distance',
            })}
          </Text>
          <Text className="text-text-secondary text-sm mt-1">
            {t('treadmillSettings.watchScaleHint', {
              defaultValue:
                'The watch estimates a treadmill run’s distance from your motion. This is how far off that has been, learned from the distances you enter after a watch run. The watch applies it to its next treadmill run. Past runs are not changed.',
            })}
          </Text>
          {ACTIVITIES.map((activity) => {
            const info = watchScale?.[activity] ?? null;
            return (
              <View
                key={activity}
                className="mt-3"
                testID={`watch-scale-${activity}`}
              >
                <Text className="text-text-primary text-base font-semibold">
                  {activity === 'walk'
                    ? t('treadmillSettings.watchScaleWalk', {
                        defaultValue: 'Walks',
                      })
                    : t('treadmillSettings.watchScaleRun', {
                        defaultValue: 'Runs',
                      })}
                </Text>
                <Text className="text-text-secondary text-sm mt-1">
                  {watchScaleStatus(info)}
                </Text>
                {info ? (
                  <Button
                    variant="secondary"
                    className="mt-2"
                    onPress={() => void resetWatchIndoorScale(activity)}
                  >
                    {t('treadmillSettings.watchScaleReset', {
                      defaultValue: 'Reset and learn from scratch',
                    })}
                  </Button>
                ) : null}
              </View>
            );
          })}
        </View>

        {ACTIVITIES.map((activity) => {
          const info = profile?.[activity];
          return (
            <View
              key={activity}
              className="bg-surface rounded-xl p-4 mb-4"
              testID={`stride-${activity}`}
            >
              <Text className="text-text-primary text-base font-bold">
                {activityName(activity)}
              </Text>
              {info ? (
                <>
                  <Text className="text-text-primary text-2xl font-semibold mt-1">
                    {decimal(strideToDisplay(info.meters, unit), strideDigits)}{' '}
                    {strideUnitLabel}
                  </Text>
                  <Text className="text-text-secondary text-sm mt-1">
                    {status(info)}
                  </Text>
                </>
              ) : null}
              <View className="flex-row items-center mt-3" style={{ gap: 8 }}>
                <FormInput
                  className="flex-1"
                  keyboardType="decimal-pad"
                  value={strideText[activity]}
                  placeholder={t('treadmillSettings.strideInput', {
                    defaultValue: 'Set by hand',
                  })}
                  accessibilityLabel={t('treadmillSettings.strideInputA11y', {
                    defaultValue: '{{activity}} in {{unit}}',
                    activity: activityName(activity),
                    unit: strideUnitLabel,
                  })}
                  onChangeText={(text) => {
                    if (text !== '' && !DECIMAL_INPUT_REGEX.test(text)) return;
                    setStrideText((current) => ({
                      ...current,
                      [activity]: text,
                    }));
                  }}
                />
                <Text className="text-text-secondary text-base">
                  {strideUnitLabel}
                </Text>
                <Button
                  variant="secondary"
                  disabled={strideText[activity].trim() === ''}
                  onPress={() => void saveStride(activity)}
                >
                  {t('common.save', { defaultValue: 'Save' })}
                </Button>
              </View>
              {strideError === activity ? (
                <Text className="text-text-danger-subtle text-sm mt-2">
                  {t('treadmillSettings.strideInvalid', {
                    defaultValue:
                      'That stride does not look right. A step is usually between 0.3 and 2.5 m (1 and 8 ft).',
                  })}
                </Text>
              ) : null}
              {info && (info.manual || info.samples > 0) ? (
                <Button
                  variant="secondary"
                  className="mt-3"
                  onPress={() => void reset(activity)}
                >
                  {t('treadmillSettings.reset', {
                    defaultValue: 'Reset and learn from scratch',
                  })}
                </Button>
              ) : null}
            </View>
          );
        })}

        <View className="bg-surface rounded-xl p-4 mb-4">
          <Text className="text-text-primary text-base font-bold">
            {t('treadmillSettings.calibrate', {
              defaultValue: 'Calibrate on purpose',
            })}
          </Text>
          <Text className="text-text-secondary text-sm mt-1 mb-3">
            {t('treadmillSettings.calibrateHint', {
              defaultValue:
                'Step 1, your stride: walk or run a distance you know is true (a track or a measured route), then enter the steps from Health or your watch and that distance. Leave the treadmill box empty. Step 2, the treadmill: do the same on the treadmill, enter the real distance (your steps times the stride from step 1) and what the display showed. That works out how far off it is.',
            })}
          </Text>
          <SegmentedControl<StepActivity>
            segments={[
              {
                key: 'walk',
                label: t('recordActivity.activity.walk', {
                  defaultValue: 'Walk',
                }),
              },
              {
                key: 'run',
                label: t('recordActivity.activity.run', {
                  defaultValue: 'Run',
                }),
              },
            ]}
            activeKey={calActivity}
            onSelect={setCalActivity}
          />
          {(
            [
              [
                'steps',
                calSteps,
                setCalSteps,
                t('treadmillSettings.calSteps', {
                  defaultValue: 'Steps taken',
                }),
                null,
              ],
              [
                'distance',
                calDistance,
                setCalDistance,
                t('treadmillSettings.calDistance', {
                  defaultValue: 'Real distance',
                }),
                unitLabel,
              ],
              [
                'shown',
                calShown,
                setCalShown,
                t('treadmillSettings.calShown', {
                  defaultValue: 'Treadmill showed (optional)',
                }),
                unitLabel,
              ],
            ] as const
          ).map(([key, value, onChange, label, suffix]) => (
            <View key={key} className="mt-3">
              <Text className="text-text-secondary text-sm mb-1">{label}</Text>
              <View className="flex-row items-center">
                <FormInput
                  className="flex-1"
                  keyboardType="decimal-pad"
                  value={value}
                  accessibilityLabel={label}
                  onChangeText={(text) => {
                    if (text !== '' && !DECIMAL_INPUT_REGEX.test(text)) return;
                    onChange(text);
                  }}
                />
                {suffix ? (
                  <Text className="text-text-secondary text-base ml-3">
                    {suffix}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
          <Button
            className="mt-4"
            disabled={calSteps.trim() === '' || calDistance.trim() === ''}
            onPress={() => void calibrate()}
          >
            {t('treadmillSettings.calibrateAction', {
              defaultValue: 'Calibrate',
            })}
          </Button>
          {calFailed ? (
            <Text className="text-text-danger-subtle text-sm mt-2">
              {t('treadmillSettings.calibrateFailed', {
                defaultValue:
                  'That is too short or does not add up. Use at least 150 steps and 100 m, and check the numbers.',
              })}
            </Text>
          ) : null}
          {calResult ? (
            <View className="mt-3">
              <Text className="text-text-primary text-sm">
                {t('treadmillSettings.calibrated', {
                  defaultValue: 'Your {{activity}} is now {{stride}} {{unit}}.',
                  activity: activityName(calResult.activity).toLowerCase(),
                  stride: decimal(
                    strideToDisplay(calResult.strideMeters, unit),
                    strideDigits
                  ),
                  unit: strideUnitLabel,
                })}
              </Text>
              {calResult.treadmillPercent !== null &&
              calResult.treadmillPercent !== 0 ? (
                <>
                  <Text className="text-text-secondary text-sm mt-1">
                    {t('treadmillSettings.calibratedPercent', {
                      defaultValue:
                        'The treadmill display is off by {{percent}}.',
                      percent: formatTreadmillPercent(
                        calResult.treadmillPercent
                      ),
                    })}
                  </Text>
                  <Button
                    variant="secondary"
                    className="mt-2"
                    onPress={() =>
                      applyMeasuredPercent(calResult.treadmillPercent ?? 0)
                    }
                  >
                    {t('treadmillSettings.useCorrection', {
                      defaultValue: 'Use this correction',
                    })}
                  </Button>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
};

export default TreadmillSettingsScreen;
