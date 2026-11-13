import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutAnimation, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import SegmentedControl from '../components/SegmentedControl';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import Button from '../components/ui/Button';
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

/** How the treadmill display compares with the distance really covered. */
type Reading = 'right' | 'long' | 'short';
/** The one row that is open; the rest of the screen stays a summary. */
type Row = StepActivity | 'treadmill';

const ACTIVITIES: StepActivity[] = ['walk', 'run'];

/** A link lined up with the text above it, not inset by the button padding. */
const LINK_STYLE = { paddingHorizontal: 0, paddingVertical: 8 };

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

interface NumberFieldProps {
  label: string;
  value: string;
  onChange: (text: string) => void;
  suffix?: string;
  placeholder?: string;
}

const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  onChange,
  suffix,
  placeholder,
}) => (
  <View className="mt-3">
    <Text className="text-text-secondary text-sm mb-1">{label}</Text>
    <View className="flex-row items-center">
      <FormInput
        className="flex-1"
        keyboardType="decimal-pad"
        value={value}
        placeholder={placeholder}
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
  const [textSecondary] = useCSSVariable(['--color-text-secondary']) as [
    string,
  ];
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
  const formatStride = (meters: number) =>
    `${decimal(strideToDisplay(meters, unit), 2)} ${strideUnitLabel}`;

  const header = useScreenHeader({
    title: t('treadmillSettings.title', { defaultValue: 'Treadmill & Stride' }),
    left: { kind: 'back' },
  });

  const activityName = (activity: StepActivity) =>
    activity === 'walk'
      ? t('treadmillSettings.walkingStride', { defaultValue: 'Walking stride' })
      : t('treadmillSettings.runningStride', {
          defaultValue: 'Running stride',
        });

  // --- The open row and its form -------------------------------------------

  const [open, setOpen] = useState<Row | null>(null);
  const [steps, setSteps] = useState('');
  const [distance, setDistance] = useState('');
  const [shown, setShown] = useState('');
  const [strideText, setStrideText] = useState('');
  const [showMeasure, setShowMeasure] = useState(false);
  const [error, setError] = useState<'stride' | 'measure' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [treadmillResult, setTreadmillResult] = useState<{
    actualMeters: number;
    percent: number;
  } | null>(null);
  const toggle = (row: Row) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((current) => (current === row ? null : row));
    setSteps('');
    setDistance('');
    setShown('');
    setStrideText('');
    setShowMeasure(false);
    setError(null);
    setNotice(null);
    setTreadmillResult(null);
  };
  const chevron = (row: Row) => (
    <Icon
      name={open === row ? 'chevron-up' : 'chevron-down'}
      size={20}
      color={textSecondary}
    />
  );

  // --- Strides -------------------------------------------------------------

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

  const strideSummary = (info: StrideInfo) => {
    const stride = formatStride(info.meters);
    if (info.manual) {
      return t('treadmillSettings.strideSummaryManual', {
        defaultValue: '{{stride}} · set by you',
        stride,
      });
    }
    if (info.samples > 0) {
      return t('treadmillSettings.strideSummaryLearned', {
        count: info.samples,
        stride,
        defaultValue_one: '{{stride}} · learned from {{count}} distance',
        defaultValue_other: '{{stride}} · learned from {{count}} distances',
        defaultValue: '{{stride}} · learned from {{count}} distances',
      });
    }
    return t('treadmillSettings.strideSummaryTypical', {
      defaultValue: '{{stride}} · typical',
      stride,
    });
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
        defaultValue_one:
          'Learned from {{count}} real distance. Each new one nudges it.',
        defaultValue_other:
          'Learned from {{count}} real distances. Each new one nudges it.',
        defaultValue:
          'Learned from {{count}} real distances. Each new one nudges it.',
      });
    }
    return t('treadmillSettings.strideDefault', {
      defaultValue:
        'A typical stride. It learns yours each time you type in a treadmill’s distance after a walk or run, or you can set it here.',
    });
  };

  const saveStride = async (activity: StepActivity) => {
    setNotice(null);
    const typed = parseField(strideText);
    const meters =
      typed === null || !Number.isFinite(typed)
        ? NaN
        : strideFromDisplay(typed, unit);
    if (!isPlausibleStride(meters) || !(await setStride(activity, meters))) {
      setError('stride');
      return;
    }
    setError(null);
    setStrideText('');
    await reload();
  };
  const measureStride = async (activity: StepActivity) => {
    setNotice(null);
    const stepCount = parseField(steps);
    const known = parseField(distance);
    const meters =
      stepCount !== null && known !== null
        ? strideFromSample(stepCount, known * unitMeters)
        : null;
    if (meters == null || !(await setStride(activity, meters))) {
      setError('measure');
      return;
    }
    setError(null);
    setSteps('');
    setDistance('');
    setShowMeasure(false);
    setNotice(
      t('treadmillSettings.calibrated', {
        defaultValue: 'Your {{activity}} is now {{stride}}.',
        activity: activityName(activity).toLowerCase(),
        stride: formatStride(meters),
      })
    );
    await reload();
  };
  const reset = async (activity: StepActivity) => {
    setError(null);
    setNotice(null);
    await resetStride(activity);
    await reload();
  };

  // --- Treadmill display ---------------------------------------------------

  const enabled = useAppPreferencesStore((s) => s.treadmillCorrectionEnabled);
  const percent = useAppPreferencesStore((s) => s.treadmillCorrectionPercent);
  const setEnabled = useAppPreferencesStore(
    (s) => s.setTreadmillCorrectionEnabled
  );
  const setPercent = useAppPreferencesStore(
    (s) => s.setTreadmillCorrectionPercent
  );
  const activePercent = enabled ? percent : 0;
  // "About right" is the correction switched off. More and Less keep their
  // own choice even at 0 %, so picking one does not snap back while typing.
  const [reading, setReading] = useState<Reading>(
    !enabled ? 'right' : percent < 0 ? 'short' : 'long'
  );
  const [percentText, setPercentText] = useState(
    percent === 0 ? '' : String(Math.abs(percent))
  );
  const commitPercent = (next: 'long' | 'short', text: string) => {
    const magnitude = parseField(text);
    if (magnitude === null) {
      setPercent(0);
      return;
    }
    if (!Number.isFinite(magnitude)) return;
    setPercent(next === 'short' ? -magnitude : magnitude);
  };
  const chooseReading = (next: Reading) => {
    setReading(next);
    if (next === 'right') {
      setEnabled(false);
      return;
    }
    setEnabled(true);
    commitPercent(next, percentText);
  };
  const applyMeasuredPercent = (measured: number) => {
    const next = clampTreadmillPercent(measured);
    setEnabled(next !== 0);
    setPercent(next);
    setReading(next === 0 ? 'right' : next < 0 ? 'short' : 'long');
    setPercentText(next === 0 ? '' : String(Math.abs(next)));
    setTreadmillResult(null);
    setShowMeasure(false);
  };
  const preview = correctTreadmillDistance(5 * unitMeters, {
    enabled: true,
    percent: activePercent,
  });
  const treadmillSummary =
    activePercent === 0
      ? t('treadmillSettings.treadmillSummaryOff', {
          defaultValue: 'About right. Nothing is changed.',
        })
      : activePercent > 0
        ? t('treadmillSettings.treadmillSummaryLong', {
            defaultValue: 'Shows {{percent}} more than you ran',
            percent: unsignedPercent(activePercent),
          })
        : t('treadmillSettings.treadmillSummaryShort', {
            defaultValue: 'Shows {{percent}} less than you ran',
            percent: unsignedPercent(activePercent),
          });

  const [checkActivity, setCheckActivity] = useState<StepActivity>('run');
  const checkTreadmill = () => {
    setTreadmillResult(null);
    const stepCount = parseField(steps);
    const display = parseField(shown);
    const result =
      stepCount !== null && display !== null
        ? treadmillCheckFromSteps(
            stepCount,
            strideMeters(checkActivity),
            display * unitMeters
          )
        : null;
    if (!result) {
      setError('measure');
      return;
    }
    setError(null);
    setTreadmillResult(result);
  };
  const treadmillResultText = (result: {
    actualMeters: number;
    percent: number;
  }) => {
    const actual = decimal(result.actualMeters / unitMeters, 2);
    if (result.percent === 0) {
      return t('treadmillSettings.checkedSame', {
        defaultValue:
          'Your steps make that {{actual}} {{unit}}. The treadmill is right, so there is nothing to fix.',
        actual,
        unit: unitLabel,
      });
    }
    return result.percent > 0
      ? t('treadmillSettings.checkedLong', {
          defaultValue:
            'Your steps make that {{actual}} {{unit}}, so the treadmill shows {{percent}} more than you did.',
          actual,
          unit: unitLabel,
          percent: unsignedPercent(result.percent),
        })
      : t('treadmillSettings.checkedShort', {
          defaultValue:
            'Your steps make that {{actual}} {{unit}}, so the treadmill shows {{percent}} less than you did.',
          actual,
          unit: unitLabel,
          percent: unsignedPercent(result.percent),
        });
  };

  // --- What the watch has learned -----------------------------------------

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
    const changePercent = unsignedPercent(change);
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
          percent: changePercent,
          defaultValue_one:
            'Lowered by {{percent}}. Learned from {{count}} run.',
          defaultValue_other:
            'Lowered by {{percent}}. Learned from {{count}} runs.',
          defaultValue: 'Lowered by {{percent}}. Learned from {{count}} runs.',
        })
      : t('treadmillSettings.watchScaleRaise', {
          count,
          percent: changePercent,
          defaultValue_one:
            'Raised by {{percent}}. Learned from {{count}} run.',
          defaultValue_other:
            'Raised by {{percent}}. Learned from {{count}} runs.',
          defaultValue: 'Raised by {{percent}}. Learned from {{count}} runs.',
        });
  };

  // --- Pieces --------------------------------------------------------------

  const errorText = (kind: 'stride' | 'measure') =>
    error === kind ? (
      <Text className="text-text-danger-subtle text-sm mt-2">
        {kind === 'stride'
          ? t('treadmillSettings.strideInvalid', {
              defaultValue:
                'That stride does not look right. A step is usually between 0.3 and 2.5 m (1 and 8 ft).',
            })
          : t('treadmillSettings.calibrateFailed', {
              defaultValue:
                'That is too short or does not add up. Use at least 150 steps and 100 m, and check the numbers.',
            })}
      </Text>
    ) : null;

  const stridePanel = (activity: StepActivity, info: StrideInfo) => (
    <View className="px-4 pb-4">
      <Text className="text-text-secondary text-sm">{strideStatus(info)}</Text>

      <View className="flex-row items-end" style={{ gap: 8 }}>
        <View className="flex-1">
          <NumberField
            label={t('treadmillSettings.strideInputA11y', {
              defaultValue: '{{activity}} in {{unit}}',
              activity: activityName(activity),
              unit: strideUnitLabel,
            })}
            value={strideText}
            onChange={setStrideText}
            placeholder={decimal(strideToDisplay(info.meters, unit), 2)}
          />
        </View>
        <Button
          variant="secondary"
          disabled={strideText.trim() === ''}
          onPress={() => void saveStride(activity)}
        >
          {t('common.save', { defaultValue: 'Save' })}
        </Button>
      </View>
      {errorText('stride')}

      {showMeasure ? (
        <View className="mt-4">
          <Text className="text-text-secondary text-sm">
            {t('treadmillSettings.measureStrideHint', {
              defaultValue:
                'Walk or run a distance you know is right, like laps of a track. Then enter the steps from Health or your watch, and that distance.',
            })}
          </Text>
          <NumberField
            label={t('treadmillSettings.calSteps', {
              defaultValue: 'Steps taken',
            })}
            value={steps}
            onChange={setSteps}
          />
          <NumberField
            label={t('treadmillSettings.calDistance', {
              defaultValue: 'Real distance',
            })}
            value={distance}
            onChange={setDistance}
            suffix={unitLabel}
          />
          <Button
            className="mt-3"
            disabled={steps.trim() === '' || distance.trim() === ''}
            onPress={() => void measureStride(activity)}
          >
            {t('treadmillSettings.calibrateAction', {
              defaultValue: 'Set my stride',
            })}
          </Button>
          {errorText('measure')}
        </View>
      ) : null}
      {notice ? (
        <Text className="text-text-primary text-sm mt-3">{notice}</Text>
      ) : null}

      <View className="flex-row mt-2" style={{ gap: 20 }}>
        {!showMeasure ? (
          <Button
            variant="link"
            style={LINK_STYLE}
            onPress={() => {
              setShowMeasure(true);
              setNotice(null);
            }}
          >
            {t('treadmillSettings.measureStrideToggle', {
              defaultValue: 'Measure it on a track',
            })}
          </Button>
        ) : null}
        {info.manual || info.samples > 0 ? (
          <Button
            variant="link"
            style={LINK_STYLE}
            accessibilityLabel={t('treadmillSettings.resetA11y', {
              defaultValue: 'Reset {{activity}}',
              activity: activityName(activity).toLowerCase(),
            })}
            onPress={() => void reset(activity)}
          >
            {t('treadmillSettings.reset', { defaultValue: 'Reset' })}
          </Button>
        ) : null}
      </View>
    </View>
  );

  const treadmillPanel = (
    <View className="px-4 pb-4">
      <Text className="text-text-secondary text-sm mb-2">
        {t('treadmillSettings.displayReads', {
          defaultValue: 'Compared with what you really ran, it shows',
        })}
      </Text>
      <SegmentedControl<Reading>
        segments={[
          {
            key: 'right',
            label: t('treadmillSettings.readsRight', {
              defaultValue: 'About right',
            }),
          },
          {
            key: 'long',
            label: t('treadmillSettings.readsLong', { defaultValue: 'More' }),
          },
          {
            key: 'short',
            label: t('treadmillSettings.readsShort', { defaultValue: 'Less' }),
          },
        ]}
        activeKey={reading}
        onSelect={chooseReading}
      />
      {reading !== 'right' ? (
        <>
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
                commitPercent(reading, text);
              }}
            />
            <Text className="text-text-secondary text-base ml-3">%</Text>
          </View>
          {preview.applied ? (
            <Text className="text-text-secondary text-sm mt-2">
              {t('treadmillSettings.preview', {
                defaultValue:
                  'When it shows {{shown}} {{unit}}, {{saved}} {{unit}} is saved.',
                shown: decimal(5, 2),
                saved: decimal(preview.correctedMeters / unitMeters, 2),
                unit: unitLabel,
              })}
            </Text>
          ) : null}
        </>
      ) : null}

      {showMeasure ? (
        <View className="mt-4">
          <Text className="text-text-secondary text-sm mb-2">
            {t('treadmillSettings.measureTreadmillHint', {
              defaultValue:
                'Walk or run on the treadmill, then enter the steps from Health or your watch and what the treadmill showed. Your steps times your stride give the real distance.',
            })}
          </Text>
          <SegmentedControl<StepActivity>
            segments={ACTIVITIES.map((key) => ({
              key,
              label:
                key === 'walk'
                  ? t('recordActivity.activity.walk', { defaultValue: 'Walk' })
                  : t('recordActivity.activity.run', { defaultValue: 'Run' }),
            }))}
            activeKey={checkActivity}
            onSelect={(next) => {
              setCheckActivity(next);
              setTreadmillResult(null);
            }}
          />
          <NumberField
            label={t('treadmillSettings.calSteps', {
              defaultValue: 'Steps taken',
            })}
            value={steps}
            onChange={setSteps}
          />
          <NumberField
            label={t('treadmillSettings.calShown', {
              defaultValue: 'Treadmill showed',
            })}
            value={shown}
            onChange={setShown}
            suffix={unitLabel}
          />
          <Button
            className="mt-3"
            disabled={steps.trim() === '' || shown.trim() === ''}
            onPress={checkTreadmill}
          >
            {t('treadmillSettings.checkAction', {
              defaultValue: 'Check my treadmill',
            })}
          </Button>
          {errorText('measure')}
          {treadmillResult ? (
            <View className="mt-3">
              <Text className="text-text-primary text-sm">
                {treadmillResultText(treadmillResult)}
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
      ) : (
        <Button
          variant="link"
          style={LINK_STYLE}
          className="self-start mt-2"
          onPress={() => setShowMeasure(true)}
        >
          {t('treadmillSettings.measureTreadmillToggle', {
            defaultValue: 'Not sure? Work it out from your steps',
          })}
        </Button>
      )}
    </View>
  );

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
        <SettingsRowGroup
          title={t('treadmillSettings.strideSection', {
            defaultValue: 'Your stride',
          })}
          subtitle={t('treadmillSettings.strideSectionHint', {
            defaultValue:
              'How far one step takes you. Indoors there is no GPS, so the app turns your steps into distance with it.',
          })}
        >
          {ACTIVITIES.map((activity) => {
            const info = profile?.[activity];
            return (
              <View key={activity} testID={`stride-${activity}`}>
                <SettingsRow
                  title={activityName(activity)}
                  subtitle={info ? strideSummary(info) : undefined}
                  onPress={() => toggle(activity)}
                  rightAccessory={chevron(activity)}
                />
                {open === activity && info ? stridePanel(activity, info) : null}
              </View>
            );
          })}
        </SettingsRowGroup>

        <SettingsRowGroup
          title={t('treadmillSettings.treadmillSection', {
            defaultValue: 'Treadmill',
          })}
          subtitle={t('treadmillSettings.treadmillSectionHint', {
            defaultValue:
              'Only changes distances you type in from a treadmill. Kept on this phone.',
          })}
        >
          <View testID="treadmill">
            <SettingsRow
              title={t('treadmillSettings.treadmillRow', {
                defaultValue: 'Treadmill display',
              })}
              subtitle={treadmillSummary}
              subtitleNumberOfLines={0}
              onPress={() => toggle('treadmill')}
              rightAccessory={chevron('treadmill')}
            />
            {open === 'treadmill' ? treadmillPanel : null}
          </View>
        </SettingsRowGroup>

        <View testID="watch-scale">
          <SettingsRowGroup
            title={t('treadmillSettings.watchScale', { defaultValue: 'Watch' })}
            subtitle={t('treadmillSettings.watchScaleHint', {
              defaultValue:
                'The watch guesses treadmill distance from your arm swing. Each time you type in what the treadmill showed after a watch run, it learns how far off it was.',
            })}
          >
            {ACTIVITIES.map((activity) => {
              const info = watchScale?.[activity] ?? null;
              return (
                <View key={activity} testID={`watch-scale-${activity}`}>
                  <SettingsRow
                    title={
                      activity === 'walk'
                        ? t('treadmillSettings.watchScaleWalk', {
                            defaultValue: 'Walks',
                          })
                        : t('treadmillSettings.watchScaleRun', {
                            defaultValue: 'Runs',
                          })
                    }
                    subtitle={watchScaleStatus(info)}
                    subtitleNumberOfLines={0}
                    rightAccessory={
                      info ? (
                        <Button
                          variant="link"
                          style={LINK_STYLE}
                          onPress={() => void resetWatchIndoorScale(activity)}
                        >
                          {t('treadmillSettings.reset', {
                            defaultValue: 'Reset',
                          })}
                        </Button>
                      ) : null
                    }
                  />
                </View>
              );
            })}
          </SettingsRowGroup>
        </View>
      </ScrollView>
    </View>
  );
};

export default TreadmillSettingsScreen;
