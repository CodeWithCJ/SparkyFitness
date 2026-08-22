import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { useCycleSettings } from '../hooks/useCycleSettings';
import { useDiscreetMode } from '../hooks/useDiscreetMode';
import {
  useCurrentPregnancy,
  usePregnancyOverview,
} from '../hooks/usePregnancy';
import { useCyclePredictionData } from '../hooks/useCyclePredictionData';
import { getPhaseColor } from '../utils/cycleDisplayUtils';
import { formatDate } from '../utils/dateUtils';
import { babyWeek } from '@workspace/shared';
import WombScene from './wellness/pregnancy/WombScene';
import { localizeBabyWeek } from '../utils/pregnancyContentLocalization';
import { formatLocalizedNumber } from '../localization';
import CycleRing from './wellness/CycleRing';
import { useWellnessTokens } from './wellness/theme/wellnessTokens';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type CycleCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface CycleCardProps {
  navigation: CycleCardNavigation;
}

function getModeTitle(
  t: TFunction,
  mode?: string,
  discreetMode?: boolean,
): string {
  if (discreetMode)
    return t('cycleCard.mode.wellness', { defaultValue: 'Wellness' });
  switch (mode) {
    case 'pregnant':
      return t('cycleCard.mode.pregnancy', {
        defaultValue: 'Pregnancy Tracking',
      });
    case 'ttc':
      return t('cycleCard.mode.fertility', {
        defaultValue: 'Fertility Tracking',
      });
    case 'postpartum':
      return t('cycleCard.mode.postpartum', {
        defaultValue: 'Postpartum Recovery',
      });
    case 'menopause':
      return t('cycleCard.mode.menopause', {
        defaultValue: 'Menopause Tracking',
      });
    case 'standard':
      return t('cycleCard.mode.cycle', { defaultValue: 'Cycle Tracking' });
    default:
      return t('cycleCard.mode.cyclePregnancy', {
        defaultValue: 'Cycle & Pregnancy',
      });
  }
}

export interface CycleRingContentInfo {
  day: number;
  phase: string;
  avgCycleLength: number;
  avgPeriodLength: number;
  fertileStartDay: number | null;
  fertileEndDay: number | null;
  ovulationDay: number | null;
  nextPeriodStart?: string;
  daysLate: number;
}

// Cycle-state card body (title, phase readout, ring, disclosure chevron) for
// the non-discreet cycle layout. Exported so DevTools can render a fake-data
// gallery of every phase.
export const CycleCardRingContent: React.FC<{
  title: string;
  info: CycleRingContentInfo;
}> = ({ title, info }) => {
  const { t, i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const tokens = useWellnessTokens();
  const [textAccent] = useCSSVariable(['--color-accent-primary']) as [string];
  const phaseName = (() => {
    switch (info.phase) {
      case 'menstrual':
        return t('cycleCard.phase.period', { defaultValue: 'Period' });
      case 'follicular':
        return t('cycleCard.phase.follicular', {
          defaultValue: 'Follicular Phase',
        });
      case 'fertile':
        return t('cycleCard.phase.fertile', {
          defaultValue: 'Est. Fertile Window',
        });
      case 'ovulation':
        return t('cycleCard.phase.ovulation', {
          defaultValue: 'Est. Ovulation',
        });
      case 'luteal':
        return t('cycleCard.phase.luteal', { defaultValue: 'Luteal Phase' });
      default:
        return t('cycleCard.phase.active', { defaultValue: 'Cycle Active' });
    }
  })();
  const phaseColor = getPhaseColor(info.phase, tokens);

  return (
    <View className="flex-row items-center gap-3">
      {/* Details on Left: stretched to the ring's height so the title sits
          at the card top; the phase block centers in the space below it */}
      <View className="flex-1 self-stretch">
        <Text className="text-md font-bold text-text-secondary">{title}</Text>

        <View className="flex-1 justify-center">
          <Text
            className="text-base font-semibold"
            style={{ color: phaseColor }}
          >
            {phaseName}
          </Text>

          {info.daysLate > 0 ? (
            <Text className="text-sm font-semibold text-text-primary mt-0.5">
              {t('cycleCard.periodLate', {
                defaultValue: 'Period {{count}} day late',
                count: info.daysLate,
              })}
            </Text>
          ) : info.nextPeriodStart ? (
            <Text className="text-sm text-text-secondary mt-0.5">
              {t('cycleCard.nextPeriod', {
                defaultValue: 'Next period est. {{date}}',
                date: formatDate(info.nextPeriodStart, dateLocale),
              })}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Visual Cycle Ring Chart on Right */}
      <CycleRing
        cycleDay={info.day > 0 ? info.day : null}
        cycleLength={info.avgCycleLength}
        periodLength={info.avgPeriodLength}
        fertileStartDay={info.fertileStartDay}
        fertileEndDay={info.fertileEndDay}
        ovulationDay={info.ovulationDay}
        centerLabel=""
        centerValue={
          info.day > 0
            ? t('cycleCard.day', { defaultValue: 'Day {{day}}', day: info.day })
            : t('cycleCard.active', { defaultValue: 'Active' })
        }
        centerSub=""
        size={98}
        strokeWidth={7.5}
      />
      <Icon name="chevron-forward" size={18} color={textAccent} />
    </View>
  );
};

const CycleCard: React.FC<CycleCardProps> = ({ navigation }) => {
  const { settings, isLoading: isSettingsLoading } = useCycleSettings();
  const { t } = useTranslation();
  const { discreetMode } = useDiscreetMode();
  const tokens = useWellnessTokens();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];

  // Pregnancy details (unconditional hook calls)
  const isPregnant = settings?.mode === 'pregnant';
  const { pregnancy } = useCurrentPregnancy();
  const hasActivePregnancy =
    isPregnant && !!pregnancy && pregnancy.status === 'active';
  const { overview } = usePregnancyOverview(undefined, hasActivePregnancy);

  // Extracted cycle statistics & predictions (unconditional hook call)
  const cycleInfo = useCyclePredictionData();

  // Hide while settings are loading to prevent layout flash (Issue 3)
  if (isSettingsLoading) {
    return null;
  }

  // Hide card if settings are null (un-opted user) or explicitly disabled (Issue 2)
  if (!settings || settings.enabled === false) {
    return null;
  }

  const isSetup = !!settings.onboarded_at && !!settings.enabled;
  const title = getModeTitle(t, settings.mode, discreetMode);
  // The cycle-ring state renders its own title so the ring can span the full
  // card height; every other state keeps the shared header row.
  const showsRingLayout = !discreetMode && !isPregnant && !!cycleInfo;

  if (!isSetup) {
    return (
      <Pressable
        className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
        onPress={() => navigation.navigate('CycleOnboarding')}
        accessibilityRole="button"
        accessibilityLabel={t('cycleCard.setupA11y', {
          defaultValue: 'Set up cycle and pregnancy tracking',
        })}
      >
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-md font-bold text-text-secondary">{title}</Text>
          <View className="flex-row items-center">
            <Text className="text-md text-accent-primary font-medium">
              {t('cycleCard.setUp', { defaultValue: 'Set Up' })}
            </Text>
            <Icon
              name="chevron-forward"
              size={14}
              color={accentPrimary}
              style={{ marginLeft: 2 }}
            />
          </View>
        </View>

        <Text className="text-sm text-text-secondary mt-1">
          {discreetMode
            ? t('cycleCard.discreetDescription', {
                defaultValue: 'Track your wellness parameters and predictions.',
              })
            : t('cycleCard.description', {
                defaultValue:
                  'Track cycle phases, predictions, symptoms, and pregnancy milestones.',
              })}
        </Text>
      </Pressable>
    );
  }

  // Render Rich Content
  const renderCardContent = () => {
    if (discreetMode) {
      const activeDay =
        cycleInfo?.day && cycleInfo.day > 0 ? cycleInfo.day : null;
      return (
        <View className="mt-1 flex-row items-center justify-between">
          <Text className="text-base font-semibold text-text-primary">
            {activeDay
              ? t('cycleCard.day', {
                  defaultValue: 'Day {{day}}',
                  day: activeDay,
                })
              : t('cycleCard.wellnessActive', {
                  defaultValue: 'Wellness Tracking Active',
                })}
          </Text>
        </View>
      );
    }

    if (isPregnant) {
      const ga = overview?.gestation;
      const baby = ga ? babyWeek(ga.week) : null;
      if (ga) {
        const localized = localizeBabyWeek(ga.week, t);
        return (
          <View className="flex-row items-center gap-3 mt-2">
            {baby && <WombScene scene={baby.wombScene} size={72} />}
            <View className="flex-1">
              <Text className="text-base font-bold text-text-primary">
                {t('cycleCard.weekDay', {
                  defaultValue: 'Week {{week}}, Day {{day}}',
                  week: ga.week,
                  day: ga.day,
                })}
              </Text>
              {baby && (
                <Text
                  className="text-sm font-semibold mt-0.5"
                  style={{ color: tokens.phasePregnant }}
                >
                  {t('cycleCard.sizeOf', {
                    defaultValue: 'Size of {{comparison}}',
                    comparison: localized?.comparison ?? baby.comparison,
                  })}
                </Text>
              )}
              <View className="flex-row items-center gap-3 mt-1.5">
                {baby?.lengthCm != null && (
                  <Text className="text-xs text-text-secondary">
                    <Text className="font-medium text-text-primary">
                      {t('cycleCard.cm', {
                        defaultValue: '{{value}} cm',
                        value: formatLocalizedNumber(baby.lengthCm),
                      })}
                    </Text>
                  </Text>
                )}
                {baby?.weightG != null && (
                  <Text className="text-xs text-text-secondary">
                    <Text className="font-medium text-text-primary">
                      {t('cycleCard.grams', {
                        defaultValue: '{{value}} g',
                        value: formatLocalizedNumber(baby.weightG),
                      })}
                    </Text>
                  </Text>
                )}
                <Text className="text-xs text-text-secondary">
                  {ga.daysRemaining > 0
                    ? t('cycleCard.daysToDue', {
                        defaultValue: '{{count}}d to due date',
                        count: ga.daysRemaining,
                      })
                    : t('cycleCard.dueNow', { defaultValue: 'Due now' })}
                </Text>
              </View>
            </View>
          </View>
        );
      }
      return (
        <View className="mt-1">
          <Text className="text-base font-semibold text-text-primary">
            {t('cycleCard.pregnancyActive', {
              defaultValue: 'Pregnancy Tracking Active',
            })}
          </Text>
          <Text className="text-sm text-text-secondary mt-0.5">
            {t('cycleCard.gestationalProgress', {
              defaultValue: 'Tap to view gestational progress.',
            })}
          </Text>
        </View>
      );
    }

    if (cycleInfo) {
      return <CycleCardRingContent title={title} info={cycleInfo} />;
    }

    return (
      <View className="mt-1">
        <Text className="text-base font-semibold text-text-primary capitalize">
          {getModeTitle(t, settings.mode, discreetMode)}
        </Text>
        <Text className="text-sm text-text-secondary mt-0.5">
          {t('cycleCard.hubProgress', {
            defaultValue: 'Tap to view cycle tracking hub.',
          })}
        </Text>
      </View>
    );
  };

  return (
    <Pressable
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
      onPress={() => navigation.navigate('CycleHub')}
      accessibilityRole="button"
      accessibilityLabel={t('cycleCard.hubA11y', {
        defaultValue: 'Open cycle and pregnancy tracking hub',
      })}
    >
      {!showsRingLayout && (
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-md font-bold text-text-secondary">{title}</Text>

          <View className="flex-row items-center">
            <Text className="text-md text-accent-primary font-medium">
              {t('cycleCard.hub', { defaultValue: 'Hub' })}
            </Text>
            <Icon
              name="chevron-forward"
              size={14}
              color={accentPrimary}
              style={{ marginLeft: 2 }}
            />
          </View>
        </View>
      )}

      {renderCardContent()}
    </Pressable>
  );
};

export default CycleCard;
