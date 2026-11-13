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
  DEFAULT_STRIDE_METERS,
  isPlausibleStride,
  strideFromDisplay,
  strideFromSample,
  strideToDisplay,
  treadmillCheckFromSteps,
  type StepActivity,
} from '../utils/stride';
import {
  clampTreadmillPercent,
  correctTreadmillDistance,
} from '../utils/treadmillCorrection';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'TreadmillSettings'>;

type Direction = 'long' | 'short';
type MeasureMode = 'stride' | 'treadmill';

const ACTIVITIES: StepActivity[] = ['walk', 'run'];

const decimal = (value: number, digits: number) =>
  formatLocalizedNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** "4%" for 4 or -4: the direction is said in words, not with a sign. */
const unsignedPercent = (percent: number) =>
  `${formatLocalizedNumber(Math.abs(percent), { maximumFractionDigits: 1 })}%`;

/** Typed text for an input: nothing while empty, NaN when malformed. */
const parseField = (text: string): number | null =>
  text.trim() === '' ? null : parseDecimalInput(text);

/** A link lined up with the text above it, not inset by the button padding. */
const LINK_STYLE = { paddingHorizontal: 0, paddingVertical: 8 };

const SectionTitle: React.FC<{ children: string }> = ({ children }) => (
  <Text className="text-text-secondary text-sm font-semibold uppercase tracking-wider mt-4 mb-2 px-1">
    {children}
  </Text>
);

const SectionHint: React.FC<{ children: string }> = ({ children }) => (
  <Text className="text-text-secondary text-sm mb-3 px-1">{children}</Text>
);

interface NumberFieldProps {
  label: string;
  value: string;
  onChange: (text: string) => void;
  suffix?: string;
}

const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  onChange,
  suffix,
}) => (
  <View className="mt-3">
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
        <Text className="text-text-secondary text-base ml-3">{suffix}</Text>
      ) : null}
    </View>
  </View>
);

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
  const formatStride = (meters: number) =>
    `${decimal(strideToDisplay(meters, unit), strideDigits)} ${strideUnitLabel}`;

  const header = useScreenHeader({
    title: t('treadmillSettings.title', { defaultValue: 'Treadmill & Stride' }),
    left: { kind: 'back' },
  });

  const activityLabel = (activity: StepActivity) =>
    activity === 'walk'
      ? t('recordActivity.activity.walk', { defaultValue: 'Walk' })
      : t('recordActivity.activity.run', { defaultValue: 'Run' });
  const activityName = (activity: StepActivity) =>
    activity === 'walk'
      ? t('treadmillSettings.walkingStride', { defaultValue: 'Walking stride' })
      : t('treadmillSettings.runningStride', {
          defaultValue: 'Running stride',
        });
  const activitySegments = ACTIVITIES.map((key) => ({
    key,
    label: activityLabel(key),
  }));

  // --- Treadmill display correction -------------------------------------

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
  const applyMeasuredPercent = (measured: number) => {
    const next = clampTreadmillPercent(measured);
    setEnabled(true);
    setPercent(next);
    setDirection(next < 0 ? 'short' : 'long');
    setPercentText(next === 0 ? '' : String(Math.abs(next)));
  };

  // --- Strides -----------------------------------------------------------

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
  const strideMeters = (activity: StepActivity) =>
    profile?.[activity].meters ?? DEFAULT_STRIDE_METERS[activity];

  const [editing, setEditing] = useState<StepActivity | null>(null);
  const [strideText, setStrideText] = useState('');
  const [strideError, setStrideError] = useState(false);
  const startEditing = (activity: StepActivity) => {
    setEditing(activity);
    setStrideText('');
    setStrideError(false);
  };
  const saveStride = async (activity: StepActivity) => {
    const typed = parseField(strideText);
    const meters =
      typed === null || !Number.isFinite(typed)
        ? NaN
        : strideFromDisplay(typed, unit);
    if (!isPlausibleStride(meters) || !(await setStride(activity, meters))) {
      setStrideError(true);
      return;
    }
    setEditing(null);
    setStrideError(false);
    await reload();
  };
  const reset = async (activity: StepActivity) => {
    setEditing(null);
    await resetStride(activity);
    await reload();
  };

  const strideStatus = (info: StrideInfo) => {
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
      defaultValue: 'A typical stride until it learns yours.',
    });
  };

  // --- Measuring on purpose ----------------------------------------------

  const [mode, setMode] = useState<MeasureMode>('stride');
  const [measureActivity, setMeasureActivity] = useState<StepActivity>('run');
  const [steps, setSteps] = useState('');
  const [distance, setDistance] = useState('');
  const [shown, setShown] = useState('');
  const [measureFailed, setMeasureFailed] = useState(false);
  const [strideResult, setStrideResult] = useState<{
    activity: StepActivity;
    meters: number;
  } | null>(null);
  const [treadmillResult, setTreadmillResult] = useState<{
    actualMeters: number;
    percent: number;
  } | null>(null);
  const clearResults = () => {
    setMeasureFailed(false);
    setStrideResult(null);
    setTreadmillResult(null);
  };

  const measureStride = async () => {
    clearResults();
    const stepCount = parseField(steps);
    const km = parseField(distance);
    const meters =
      stepCount !== null && km !== null
        ? strideFromSample(stepCount, km * unitMeters)
        : null;
    if (meters == null || !(await setStride(measureActivity, meters))) {
      setMeasureFailed(true);
      return;
    }
    setStrideResult({ activity: measureActivity, meters });
    await reload();
  };

  const checkTreadmill = () => {
    clearResults();
    const stepCount = parseField(steps);
    const display = parseField(shown);
    const result =
      stepCount !== null && display !== null
        ? treadmillCheckFromSteps(
            stepCount,
            strideMeters(measureActivity),
            display * unitMeters
          )
        : null;
    if (!result) {
      setMeasureFailed(true);
      return;
    }
    setTreadmillResult(result);
  };

  // --- What the watch has learned ----------------------------------------

  // It changes when a run is corrected, so this follows the store rather
  // than loading once.
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
  const watchScaleStatus = (info: LearnedScale | null) => {
    if (!info) {
      return t('treadmillSettings.watchScaleNone', {
        defaultValue: 'Not learned yet.',
      });
    }
    const change = (info.scale - 1) * 100;
    const count = info.samples;
    const percent = unsignedPercent(change);
    if (Math.abs(change) < 0.05) {
      return t('treadmillSettings.watchScaleSame', {
        count,
        defaultValue_one:
          'The watch matches the treadmill. Learned from {{count}} run.',
        defaultValue_other:
          'The watch matches the treadmill. Learned from {{count}} runs.',
        defaultValue:
          'The watch matches the treadmill. Learned from {{count}} runs.',
      });
    }
    return change < 0
      ? t('treadmillSettings.watchScaleLower', {
          count,
          percent,
          defaultValue_one:
            'The watch’s distance is lowered by {{percent}}. Learned from {{count}} run.',
          defaultValue_other:
            'The watch’s distance is lowered by {{percent}}. Learned from {{count}} runs.',
          defaultValue:
            'The watch’s distance is lowered by {{percent}}. Learned from {{count}} runs.',
        })
      : t('treadmillSettings.watchScaleRaise', {
          count,
          percent,
          defaultValue_one:
            'The watch’s distance is raised by {{percent}}. Learned from {{count}} run.',
          defaultValue_other:
            'The watch’s distance is raised by {{percent}}. Learned from {{count}} runs.',
          defaultValue:
            'The watch’s distance is raised by {{percent}}. Learned from {{count}} runs.',
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
        <Text className="text-text-secondary text-sm px-1">
          {t('treadmillSettings.intro', {
            defaultValue:
              'Indoors there is no GPS, so the app works out distance from your steps and your stride. When you type in what the treadmill showed, that is used instead, and your stride learns from it.',
          })}
        </Text>

        {/* Your stride */}
        <SectionTitle>
          {t('treadmillSettings.strideSection', {
            defaultValue: 'Your stride',
          })}
        </SectionTitle>
        <View className="bg-surface rounded-xl px-4 mb-2">
          {ACTIVITIES.map((activity, index) => {
            const info = profile?.[activity];
            const changed = info ? info.manual || info.samples > 0 : false;
            return (
              <View
                key={activity}
                className={`py-4 ${index > 0 ? 'border-t border-border-subtle' : ''}`}
                testID={`stride-${activity}`}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-text-primary text-base font-semibold">
                    {activityName(activity)}
                  </Text>
                  {info ? (
                    <Text className="text-text-primary text-lg font-semibold">
                      {formatStride(info.meters)}
                    </Text>
                  ) : null}
                </View>
                {info ? (
                  <Text className="text-text-secondary text-sm mt-1">
                    {strideStatus(info)}
                  </Text>
                ) : null}

                {editing === activity ? (
                  <>
                    <View
                      className="flex-row items-center mt-3"
                      style={{ gap: 8 }}
                    >
                      <FormInput
                        className="flex-1"
                        keyboardType="decimal-pad"
                        autoFocus
                        value={strideText}
                        placeholder={
                          info
                            ? decimal(
                                strideToDisplay(info.meters, unit),
                                strideDigits
                              )
                            : undefined
                        }
                        accessibilityLabel={t(
                          'treadmillSettings.strideInputA11y',
                          {
                            defaultValue: '{{activity}} in {{unit}}',
                            activity: activityName(activity),
                            unit: strideUnitLabel,
                          }
                        )}
                        onChangeText={(text) => {
                          if (text !== '' && !DECIMAL_INPUT_REGEX.test(text))
                            return;
                          setStrideText(text);
                        }}
                      />
                      <Text className="text-text-secondary text-base">
                        {strideUnitLabel}
                      </Text>
                      <Button
                        variant="secondary"
                        disabled={strideText.trim() === ''}
                        onPress={() => void saveStride(activity)}
                      >
                        {t('common.save', { defaultValue: 'Save' })}
                      </Button>
                    </View>
                    {strideError ? (
                      <Text className="text-text-danger-subtle text-sm mt-2">
                        {t('treadmillSettings.strideInvalid', {
                          defaultValue:
                            'That stride does not look right. A step is usually between 0.3 and 2.5 m (1 and 8 ft).',
                        })}
                      </Text>
                    ) : null}
                  </>
                ) : null}

                <View className="flex-row mt-2" style={{ gap: 16 }}>
                  <Button
                    variant="link"
                    style={LINK_STYLE}
                    className="self-start"
                    onPress={() =>
                      editing === activity
                        ? setEditing(null)
                        : startEditing(activity)
                    }
                  >
                    {editing === activity
                      ? t('common.cancel', { defaultValue: 'Cancel' })
                      : t('treadmillSettings.strideEdit', {
                          defaultValue: 'Type it in',
                        })}
                  </Button>
                  {changed ? (
                    <Button
                      variant="link"
                      style={LINK_STYLE}
                      className="self-start"
                      accessibilityLabel={t('treadmillSettings.resetA11y', {
                        defaultValue: 'Reset {{activity}}',
                        activity: activityName(activity).toLowerCase(),
                      })}
                      onPress={() => void reset(activity)}
                    >
                      {t('treadmillSettings.reset', {
                        defaultValue: 'Reset',
                      })}
                    </Button>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        {/* Treadmill display */}
        <SectionTitle>
          {t('treadmillSettings.displaySection', {
            defaultValue: 'Treadmill display',
          })}
        </SectionTitle>
        <SettingsRow
          title={t('treadmillSettings.correction', {
            defaultValue: 'Correct my treadmill',
          })}
          subtitle={t('treadmillSettings.correctionSubtitle', {
            defaultValue:
              'Turn on if your treadmill shows more or less distance than you really covered. The distance you type in from it is then fixed before it is saved. Distances worked out from your steps are not changed. Kept on this phone.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              accessibilityLabel={t('treadmillSettings.correctionA11y', {
                defaultValue: 'Correct my treadmill',
              })}
            />
          }
        />

        {enabled ? (
          <View className="bg-surface rounded-xl p-4 mb-2">
            <Text className="text-text-primary text-base font-semibold mb-2">
              {t('treadmillSettings.displayReads', {
                defaultValue: 'It shows',
              })}
            </Text>
            <SegmentedControl<Direction>
              segments={[
                {
                  key: 'long',
                  label: t('treadmillSettings.readsLong', {
                    defaultValue: 'More than I ran',
                  }),
                },
                {
                  key: 'short',
                  label: t('treadmillSettings.readsShort', {
                    defaultValue: 'Less than I ran',
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
              <Text className="text-text-secondary text-base mr-3">
                {t('treadmillSettings.percentBy', { defaultValue: 'By' })}
              </Text>
              <FormInput
                className="flex-1"
                keyboardType="decimal-pad"
                value={percentText}
                placeholder="0"
                accessibilityLabel={t('treadmillSettings.percentA11y', {
                  defaultValue: 'Percent the treadmill is off',
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
                      'When the treadmill shows {{shown}} {{unit}}, {{saved}} {{unit}} is saved.',
                    shown: decimal(5, 2),
                    saved: decimal(preview.correctedMeters / unitMeters, 2),
                    unit: unitLabel,
                  })
                : t('treadmillSettings.previewNone', {
                    defaultValue:
                      'Not sure by how much? Use Measure, below, to find out.',
                  })}
            </Text>
          </View>
        ) : null}

        {/* Measure */}
        <SectionTitle>
          {t('treadmillSettings.measureSection', { defaultValue: 'Measure' })}
        </SectionTitle>
        <SectionHint>
          {t('treadmillSettings.measureHint', {
            defaultValue:
              'Optional. Measure your stride first, then use it to check the treadmill. Get the steps from Health or your watch.',
          })}
        </SectionHint>
        <View className="bg-surface rounded-xl p-4 mb-2">
          <SegmentedControl<MeasureMode>
            segments={[
              {
                key: 'stride',
                label: t('treadmillSettings.measureStride', {
                  defaultValue: 'My stride',
                }),
              },
              {
                key: 'treadmill',
                label: t('treadmillSettings.measureTreadmill', {
                  defaultValue: 'My treadmill',
                }),
              },
            ]}
            activeKey={mode}
            onSelect={(next) => {
              setMode(next);
              clearResults();
            }}
          />
          <View className="mt-3">
            <SegmentedControl<StepActivity>
              segments={activitySegments}
              activeKey={measureActivity}
              onSelect={(next) => {
                setMeasureActivity(next);
                clearResults();
              }}
            />
          </View>

          <Text className="text-text-secondary text-sm mt-3">
            {mode === 'stride'
              ? t('treadmillSettings.measureStrideHint', {
                  defaultValue:
                    'Walk or run a distance you know is right, like laps of a track, then enter your steps and that distance.',
                })
              : t('treadmillSettings.measureTreadmillHint', {
                  defaultValue:
                    'Walk or run on the treadmill, then enter your steps and what the treadmill showed. Your steps times your {{activity}} ({{stride}}) give the real distance.',
                  activity: activityName(measureActivity).toLowerCase(),
                  stride: formatStride(strideMeters(measureActivity)),
                })}
          </Text>

          <NumberField
            label={t('treadmillSettings.calSteps', {
              defaultValue: 'Steps taken',
            })}
            value={steps}
            onChange={setSteps}
          />
          {mode === 'stride' ? (
            <NumberField
              label={t('treadmillSettings.calDistance', {
                defaultValue: 'Real distance',
              })}
              value={distance}
              onChange={setDistance}
              suffix={unitLabel}
            />
          ) : (
            <NumberField
              label={t('treadmillSettings.calShown', {
                defaultValue: 'Treadmill showed',
              })}
              value={shown}
              onChange={setShown}
              suffix={unitLabel}
            />
          )}

          <Button
            className="mt-4"
            disabled={
              steps.trim() === '' ||
              (mode === 'stride' ? distance : shown).trim() === ''
            }
            onPress={() =>
              mode === 'stride' ? void measureStride() : checkTreadmill()
            }
          >
            {mode === 'stride'
              ? t('treadmillSettings.calibrateAction', {
                  defaultValue: 'Set my stride',
                })
              : t('treadmillSettings.checkAction', {
                  defaultValue: 'Check my treadmill',
                })}
          </Button>

          {measureFailed ? (
            <Text className="text-text-danger-subtle text-sm mt-2">
              {t('treadmillSettings.calibrateFailed', {
                defaultValue:
                  'That is too short or does not add up. Use at least 150 steps and 100 m, and check the numbers.',
              })}
            </Text>
          ) : null}

          {strideResult ? (
            <Text className="text-text-primary text-sm mt-3">
              {t('treadmillSettings.calibrated', {
                defaultValue: 'Your {{activity}} is now {{stride}}.',
                activity: activityName(strideResult.activity).toLowerCase(),
                stride: formatStride(strideResult.meters),
              })}
            </Text>
          ) : null}

          {treadmillResult ? (
            <View className="mt-3">
              <Text className="text-text-primary text-sm">
                {treadmillResult.percent === 0
                  ? t('treadmillSettings.checkedSame', {
                      defaultValue:
                        'Your steps make that {{actual}} {{unit}}. The treadmill is right, so there is nothing to fix.',
                      actual: decimal(
                        treadmillResult.actualMeters / unitMeters,
                        2
                      ),
                      unit: unitLabel,
                    })
                  : treadmillResult.percent > 0
                    ? t('treadmillSettings.checkedLong', {
                        defaultValue:
                          'Your steps make that {{actual}} {{unit}}, so the treadmill shows {{percent}} more than you did.',
                        actual: decimal(
                          treadmillResult.actualMeters / unitMeters,
                          2
                        ),
                        unit: unitLabel,
                        percent: unsignedPercent(treadmillResult.percent),
                      })
                    : t('treadmillSettings.checkedShort', {
                        defaultValue:
                          'Your steps make that {{actual}} {{unit}}, so the treadmill shows {{percent}} less than you did.',
                        actual: decimal(
                          treadmillResult.actualMeters / unitMeters,
                          2
                        ),
                        unit: unitLabel,
                        percent: unsignedPercent(treadmillResult.percent),
                      })}
              </Text>
              {treadmillResult.percent !== 0 ? (
                <Button
                  variant="secondary"
                  className="mt-2"
                  onPress={() => applyMeasuredPercent(treadmillResult.percent)}
                >
                  {t('treadmillSettings.useCorrection', {
                    defaultValue: 'Use this correction',
                  })}
                </Button>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Watch */}
        <SectionTitle>
          {t('treadmillSettings.watchScale', { defaultValue: 'Watch' })}
        </SectionTitle>
        <SectionHint>
          {t('treadmillSettings.watchScaleHint', {
            defaultValue:
              'The watch guesses treadmill distance from your arm swing. When you type in what the treadmill showed after a watch run, it learns how far off it was and fixes its next runs.',
          })}
        </SectionHint>
        <View className="bg-surface rounded-xl px-4 mb-4" testID="watch-scale">
          {ACTIVITIES.map((activity, index) => {
            const info = watchScale?.[activity] ?? null;
            return (
              <View
                key={activity}
                className={`py-4 ${index > 0 ? 'border-t border-border-subtle' : ''}`}
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
                    variant="link"
                    style={LINK_STYLE}
                    className="self-start mt-2"
                    onPress={() => void resetWatchIndoorScale(activity)}
                  >
                    {t('treadmillSettings.reset', { defaultValue: 'Reset' })}
                  </Button>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

export default TreadmillSettingsScreen;
