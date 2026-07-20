import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useCycleCorrelations } from '../../hooks/useCycleInsights';
import type { CorrelationResult, ConditionFlag } from '@workspace/shared';
import Icon from '../Icon';

const METRIC_LABELS: Record<string, string> = {
  weight: 'Weight',
  mood: 'Mood',
  sleep: 'Sleep',
  energy: 'Energy',
};

const METRIC_UNITS: Record<string, string> = {
  weight: 'kg',
  mood: '',
  sleep: 'h',
  energy: '',
};

const PHASE_LABELS: Record<string, string> = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  fertile: 'Fertile',
  ovulation: 'Ovulation',
  luteal: 'Luteal',
};

const CONDITION_LABELS: Record<string, string> = {
  long_cycles:
    'Your cycles average over 35 days. This pattern is sometimes associated with PCOS — worth discussing with a clinician.',
  irregular_cycles:
    'Your cycles vary quite a bit. Tracking a few more will sharpen your picture; consider mentioning it to a clinician.',
  short_cycles:
    'Your cycles are shorter than typical. If this is new, it may be worth a clinician’s input.',
};

interface CorrelationCardProps {
  c: CorrelationResult;
}

const CorrelationCard: React.FC<CorrelationCardProps> = ({ c }) => {
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  if (!c.hasEnoughData) return null;
  const label = METRIC_LABELS[c.metric] || c.metric;
  const unit = METRIC_UNITS[c.metric] || '';
  const max = Math.max(...c.byPhase.map((p) => p.mean), 1);

  return (
    <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-sm gap-3 mb-3">
      <View className="flex-row items-center gap-1.5">
        <Icon name="measurements" size={18} color={accentColor} />
        <Text className="text-text-primary text-sm font-semibold">
          {label} by cycle phase
        </Text>
      </View>
      <View className="gap-2">
        {c.byPhase.map((p) => {
          const percentage = p.count ? Math.round((p.mean / max) * 100) : 0;
          return (
            <View key={p.phase} className="flex-row items-center gap-2">
              <Text className="w-20 text-text-secondary text-xs">
                {PHASE_LABELS[p.phase] || p.phase}
              </Text>
              <View className="flex-1 h-2 rounded-full bg-raised overflow-hidden">
                <View
                  className="h-full bg-blue-500/70 rounded-full"
                  style={{ width: `${percentage}%` }}
                />
              </View>
              <Text className="w-12 text-right text-text-primary text-xs font-semibold">
                {p.count ? `${p.mean}${unit}` : '—'}
              </Text>
            </View>
          );
        })}
      </View>
      {c.peakPhase ? (
        <Text className="text-xs text-text-secondary leading-relaxed border-t border-border-subtle pt-2">
          {label} tends to be {c.peakDelta > 0 ? 'higher' : 'lower'} in your {PHASE_LABELS[c.peakPhase] || c.peakPhase} phase ({c.peakDelta > 0 ? `+${c.peakDelta}` : c.peakDelta}{unit} vs your average).
        </Text>
      ) : null}
    </View>
  );
};

const CorrelationCards: React.FC = () => {
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
      <View className="bg-surface rounded-2xl p-6 border border-dashed border-border-subtle items-center gap-2">
        <Icon name="wellness" size={24} color={textMuted} />
        <Text className="text-text-primary font-semibold text-sm">
          Correlations unlock with more data
        </Text>
        <Text className="text-text-secondary text-xs text-center max-w-[260px] leading-relaxed">
          Keep logging weight, mood, sleep and energy across a few cycles to see how they move with your phases.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {flags.map((f) => (
        <View
          key={f.key}
          className="flex-row items-start p-3 bg-amber-50/60 rounded-xl border border-amber-200"
        >
          <View className="mr-2 mt-0.5">
            <Icon name="warning" size={16} color={warningColor} />
          </View>
          <Text className="flex-1 text-xs text-amber-800 leading-normal">
            {CONDITION_LABELS[f.key] || ''}
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
