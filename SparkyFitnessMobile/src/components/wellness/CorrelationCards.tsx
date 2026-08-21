import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useCycleCorrelations } from '../../hooks/useCycleInsights';
import type { CorrelationResult } from '@workspace/shared';
import Icon from '../Icon';
import { formatLocalizedNumber } from '../../localization';

const METRIC_UNITS: Record<string, string> = {
  weight: 'kg',
  mood: '',
  sleep: 'h',
  energy: '',
};

/**
 * Formats a metric value with a space before its (non-empty) unit, so PL renders
 * "65,5 kg" / "7,5 h", and dimensionless metrics (mood/energy) get no trailing
 * space. Uses the application-locale number formatter.
 */
export function formatMetricWithUnit(value: number, unit: string): string {
  const number = formatLocalizedNumber(value);
  return unit ? `${number} ${unit}` : number;
}

/** Resolves the sentence-safe phase label for the peak sentence. */
function sentencePhase(t: TFunction, phase: string): string {
  switch (phase) {
    case 'menstrual':
      return t('cycleCorrelations.phasesSentence.menstrual', {
        defaultValue: 'Menstrual phase',
      });
    case 'follicular':
      return t('cycleCorrelations.phasesSentence.follicular', {
        defaultValue: 'Follicular phase',
      });
    case 'fertile':
      return t('cycleCorrelations.phasesSentence.fertile', {
        defaultValue: 'Fertile phase',
      });
    case 'ovulation':
      return t('cycleCorrelations.phasesSentence.ovulation', {
        defaultValue: 'Ovulation',
      });
    case 'luteal':
      return t('cycleCorrelations.phasesSentence.luteal', {
        defaultValue: 'Luteal phase',
      });
    default:
      return phase;
  }
}

interface CorrelationCardProps {
  c: CorrelationResult;
}

const CorrelationCard: React.FC<CorrelationCardProps> = ({ c }) => {
  const { t } = useTranslation();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  if (!c.hasEnoughData) return null;
  const label =
    c.metric === 'weight'
      ? t('cycleCorrelations.metrics.weight', { defaultValue: 'Weight' })
      : c.metric === 'mood'
      ? t('cycleCorrelations.metrics.mood', { defaultValue: 'Mood' })
      : c.metric === 'sleep'
      ? t('cycleCorrelations.metrics.sleep', { defaultValue: 'Sleep' })
      : c.metric === 'energy'
      ? t('cycleCorrelations.metrics.energy', { defaultValue: 'Energy' })
      : c.metric;
  const unit = METRIC_UNITS[c.metric] || '';
  const max = Math.max(...c.byPhase.map(p => p.mean), 1);

  return (
    <View className="bg-surface rounded-xl p-4 border-0 shadow-sm gap-3 mb-3">
      <View className="flex-row items-center gap-1.5">
        <Icon name="measurements" size={18} color={accentColor} />
        <Text className="text-text-primary text-sm font-semibold">
          {t('cycleCorrelations.byPhase', {
            defaultValue: '{{metric}} by cycle phase',
            metric: label,
          })}
        </Text>
      </View>
      <View className="gap-2">
        {c.byPhase.map(p => {
          const percentage = p.count ? Math.round((p.mean / max) * 100) : 0;
          return (
            <View key={p.phase} className="flex-row items-center gap-2">
              <Text className="w-20 text-text-secondary text-sm">
                {p.phase === 'menstrual'
                  ? t('cycleCorrelations.phases.menstrual', {
                      defaultValue: 'Menstrual',
                    })
                  : p.phase === 'follicular'
                  ? t('cycleCorrelations.phases.follicular', {
                      defaultValue: 'Follicular',
                    })
                  : p.phase === 'fertile'
                  ? t('cycleCorrelations.phases.fertile', {
                      defaultValue: 'Fertile',
                    })
                  : p.phase === 'ovulation'
                  ? t('cycleCorrelations.phases.ovulation', {
                      defaultValue: 'Ovulation',
                    })
                  : p.phase === 'luteal'
                  ? t('cycleCorrelations.phases.luteal', {
                      defaultValue: 'Luteal',
                    })
                  : p.phase}
              </Text>
              <View className="flex-1 h-2 rounded-full bg-progress-rail overflow-hidden">
                <View
                  className="h-full bg-accent-primary rounded-full"
                  style={{ width: `${percentage}%` }}
                />
              </View>
              <Text className="w-14 text-right text-text-primary text-sm font-semibold">
                {p.count ? formatMetricWithUnit(p.mean, unit) : '—'}
              </Text>
            </View>
          );
        })}
      </View>
      {c.peakPhase ? (
        <Text className="text-sm text-text-secondary leading-relaxed border-t border-border-subtle pt-2">
          {t('cycleCorrelations.peak', {
            defaultValue:
              '{{phase}}: {{metric}} tends to be {{direction}} ({{delta}}{{unit}} vs. your average).',
            metric: label,
            direction:
              c.peakDelta > 0
                ? t('cycleCorrelations.higher', { defaultValue: 'higher' })
                : t('cycleCorrelations.lower', { defaultValue: 'lower' }),
            phase: sentencePhase(t, c.peakPhase),
            delta:
              c.peakDelta > 0
                ? `+${formatLocalizedNumber(c.peakDelta)}`
                : formatLocalizedNumber(c.peakDelta),
            unit: unit ? ` ${unit}` : '',
          })}
        </Text>
      ) : null}
    </View>
  );
};

const CorrelationCards: React.FC = () => {
  const { t } = useTranslation();
  const { correlations } = useCycleCorrelations();
  const [textMuted, warningColor] = useCSSVariable([
    '--color-text-muted',
    '--color-icon-warning',
  ]) as [string, string];
  if (!correlations) return null;

  const flags = correlations.conditionFlags;
  const usable = correlations.correlations.filter(c => c.hasEnoughData);

  if (usable.length === 0 && flags.length === 0) {
    return (
      <View className="bg-surface rounded-xl p-6 border-none items-center gap-2">
        <Icon name="wellness" size={24} color={textMuted} />
        <Text className="text-text-primary font-semibold text-sm">
          {t('cycleCorrelations.noDataTitle', {
            defaultValue: 'Correlations unlock with more data',
          })}
        </Text>
        <Text className="text-text-secondary text-xs text-center max-w-[260px] leading-relaxed">
          {t('cycleCorrelations.noDataHint', {
            defaultValue:
              'Keep logging weight, mood, sleep and energy across a few cycles to see how they move with your phases.',
          })}
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {flags.map(f => (
        <View
          key={f.key}
          className="flex-row items-start p-3 bg-surface rounded-xl border-none shadow-sm"
        >
          <View className="mr-2 mt-0.5">
            <Icon name="warning" size={18} color={warningColor} />
          </View>
          <Text className="flex-1 text-sm text-text-primary leading-normal">
            {f.key === 'long_cycles'
              ? t('cycleCorrelations.conditions.longCycles', {
                  defaultValue:
                    'Your cycles average over 35 days. If this is new for you, it may be worth discussing with a clinician.',
                })
              : f.key === 'irregular_cycles'
              ? t('cycleCorrelations.conditions.irregularCycles', {
                  defaultValue:
                    'Your cycles vary quite a bit. Tracking a few more will sharpen your picture; consider mentioning it to a clinician.',
                })
              : f.key === 'short_cycles'
              ? t('cycleCorrelations.conditions.shortCycles', {
                  defaultValue:
                    'Your cycles are shorter than typical. If this is new, it may be worth a clinician’s input.',
                })
              : f.key}
          </Text>
        </View>
      ))}
      {usable.map(c => (
        <CorrelationCard key={c.metric} c={c} />
      ))}
    </View>
  );
};

export default CorrelationCards;
