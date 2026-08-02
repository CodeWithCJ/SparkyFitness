import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useCycleCorrelations } from '../../hooks/useCycleInsights';
import type { CorrelationResult, ConditionFlag } from '@workspace/shared';
import Icon from '../Icon';
import { useTranslation } from 'react-i18next';
import { formatLocalizedNumber } from '../../localization';

const METRIC_UNITS: Record<string, string> = {
  weight: 'kg',
  mood: '',
  sleep: 'h',
  energy: '',
};

function metricLabel(metric: string, t: (key: string) => string): string {
  switch (metric) {
    case 'weight': return t('mobileComponents.correlation.metricWeight');
    case 'mood': return t('mobileComponents.correlation.metricMood');
    case 'sleep': return t('mobileComponents.correlation.metricSleep');
    case 'energy': return t('mobileComponents.correlation.metricEnergy');
    default: return metric;
  }
}

function phaseLabel(phase: string, t: (key: string) => string): string {
  switch (phase) {
    case 'menstrual': return t('mobileComponents.correlation.phaseMenstrual');
    case 'follicular': return t('mobileComponents.correlation.phaseFollicular');
    case 'fertile': return t('mobileComponents.correlation.phaseFertile');
    case 'ovulation': return t('mobileComponents.correlation.phaseOvulation');
    case 'luteal': return t('mobileComponents.correlation.phaseLuteal');
    default: return phase;
  }
}

function conditionLabel(key: string, t: (key: string) => string): string {
  switch (key) {
    case 'long_cycles': return t('mobileComponents.correlation.flagLongCycles');
    case 'irregular_cycles': return t('mobileComponents.correlation.flagIrregularCycles');
    case 'short_cycles': return t('mobileComponents.correlation.flagShortCycles');
    default: return '';
  }
}

interface CorrelationCardProps {
  c: CorrelationResult;
}

const CorrelationCard: React.FC<CorrelationCardProps> = ({ c }) => {
  const { t } = useTranslation();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  if (!c.hasEnoughData) return null;
  const label = metricLabel(c.metric, t);
  const unit = METRIC_UNITS[c.metric] || '';
  const max = Math.max(...c.byPhase.map((p) => p.mean), 1);

  return (
    <View className="bg-surface rounded-xl p-4 border-0 shadow-sm gap-3 mb-3">
      <View className="flex-row items-center gap-1.5">
        <Icon name="measurements" size={18} color={accentColor} />
        <Text className="text-text-primary text-sm font-semibold">
           {t('mobileComponents.correlation.byPhase', { metric: label })}
        </Text>
      </View>
      <View className="gap-2">
        {c.byPhase.map((p) => {
          const percentage = p.count ? Math.round((p.mean / max) * 100) : 0;
          return (
            <View key={p.phase} className="flex-row items-center gap-2">
              <Text className="w-20 text-text-secondary text-xs">
                {phaseLabel(p.phase, t)}
              </Text>
              <View className="flex-1 h-2 rounded-full bg-raised overflow-hidden">
                <View
                  className="h-full bg-accent-primary rounded-full"
                  style={{ width: `${percentage}%` }}
                />
              </View>
              <Text className="w-12 text-right text-text-primary text-xs font-semibold">
                {p.count ? `${formatLocalizedNumber(p.mean, { maximumFractionDigits: 2 })}${unit}` : '—'}
              </Text>
            </View>
          );
        })}
      </View>
      {c.peakPhase ? (
        <Text className="text-xs text-text-secondary leading-relaxed border-t border-border-subtle pt-2">
          {t('mobileComponents.correlation.summary', {
            metric: label,
            direction: c.peakDelta > 0 ? t('mobileComponents.correlation.higher') : t('mobileComponents.correlation.lower'),
            phase: phaseLabel(c.peakPhase, t),
            delta: c.peakDelta > 0 ? `+${c.peakDelta}` : c.peakDelta,
            unit,
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

  // Since correlations on server comes as an array of CorrelationResult or similar inside correlations object,
  // let's cast or handle correlations.correlations.
  const list = ((correlations as any).correlations || []) as CorrelationResult[];
  const flags = ((correlations as any).conditionFlags || []) as ConditionFlag[];

  const usable = list.filter((c) => c.hasEnoughData);

  if (usable.length === 0 && flags.length === 0) {
    return (
      <View className="bg-surface rounded-xl p-6 border-none items-center gap-2">
        <Icon name="wellness" size={24} color={textMuted} />
        <Text className="text-text-primary font-semibold text-sm">
          {t('mobileComponents.correlation.emptyTitle')}
        </Text>
        <Text className="text-text-secondary text-xs text-center max-w-[260px] leading-relaxed">
          {t('mobileComponents.correlation.emptyBody')}
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {flags.map((f) => (
        <View
          key={f.key}
          className="flex-row items-start p-3 bg-surface rounded-xl border-none"
        >
          <View className="mr-2 mt-0.5">
            <Icon name="warning" size={16} color={warningColor} />
          </View>
          <Text className="flex-1 text-xs text-text-primary leading-normal">
             {conditionLabel(f.key, t)}
          </Text>
        </View>
      ))}
      {usable.map((c) => (
        <CorrelationCard key={c.metric} c={c} />
      ))}
    </View>
  );
};

export default CorrelationCards;
