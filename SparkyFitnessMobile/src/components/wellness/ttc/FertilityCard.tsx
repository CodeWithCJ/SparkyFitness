import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useCycleFertility } from '../../../hooks/useCycleInsights';
import { daysBetween } from '@workspace/shared';
import { getTodayDate, formatDate } from '../../../utils/dateUtils';

interface FertilityCardProps {
  date?: string;
}

/**
 * TTC summary: estimated ovulation, current fertile-window status, and a
 * "two-week-wait" (days-past-ovulation) readout. Consumes GET /v2/cycle/fertility.
 */
const FertilityCard: React.FC<FertilityCardProps> = ({ date }) => {
  const referenceDate = date ?? getTodayDate();
  const { fertility, isLoading } = useCycleFertility(referenceDate);
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  const dpo = useMemo(() => {
    if (!fertility?.ovulationDate) return null;
    const diff = daysBetween(fertility.ovulationDate, referenceDate);
    return diff >= 0 ? diff : null;
  }, [fertility, referenceDate]);

  const isFertileToday = useMemo(
    () => !!fertility?.fertileWindow?.includes(referenceDate),
    [fertility, referenceDate]
  );

  if (isLoading) {
    return (
      <View className="bg-surface rounded-2xl p-6 items-center border border-border-subtle shadow-sm">
        <ActivityIndicator color={accentColor} />
      </View>
    );
  }

  if (!fertility) {
    return (
      <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-sm">
        <Text className="text-text-primary text-sm font-semibold mb-1">Fertility</Text>
        <Text className="text-text-secondary text-xs">
          Log a few cycles to see fertile-window estimates.
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-sm gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-text-primary text-sm font-semibold">Fertility</Text>
        {isFertileToday && (
          <View className="rounded-full bg-green-100 px-3 py-1">
            <Text className="text-green-700 text-xs font-semibold">Fertile window</Text>
          </View>
        )}
      </View>

      <View className="flex-row justify-between">
        <View>
          <Text className="text-text-secondary text-xs">Est. ovulation</Text>
          <Text className="text-text-primary text-base font-bold">
            {fertility.ovulationDate ? formatDate(fertility.ovulationDate) : '—'}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-text-secondary text-xs">Next period in</Text>
          <Text className="text-text-primary text-base font-bold">
            {fertility.daysUntilNextPeriod >= 0 ? `${fertility.daysUntilNextPeriod} days` : '—'}
          </Text>
        </View>
      </View>

      {dpo !== null && (
        <View className="rounded-xl bg-raised p-3">
          <Text className="text-text-secondary text-xs mb-0.5">Two-week wait</Text>
          <Text className="text-text-primary text-sm font-semibold">
            {dpo === 0 ? 'Ovulation day' : `${dpo} ${dpo === 1 ? 'day' : 'days'} past ovulation`}
          </Text>
          {dpo >= 1 && dpo < 14 && (
            <Text className="text-text-secondary text-xs mt-1">
              A test is typically most accurate around 12–14 DPO.
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

export default FertilityCard;
