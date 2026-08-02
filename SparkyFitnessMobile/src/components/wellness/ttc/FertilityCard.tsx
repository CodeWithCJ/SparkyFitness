import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useCycleFertility } from '../../../hooks/useCycleInsights';
import { daysBetween } from '@workspace/shared';
import { getTodayDate, formatDate } from '../../../utils/dateUtils';

import { useCyclePredictionData } from '../../../hooks/useCyclePredictionData';

interface FertilityCardProps {
  date?: string;
}

/**
 * TTC summary: estimated ovulation, current fertile-window status, and a
 * "two-week-wait" (days-past-ovulation) readout. Consumes GET /v2/cycle/fertility
 * with client-side prediction fallback.
 */
const FertilityCard: React.FC<FertilityCardProps> = ({ date }) => {
  const referenceDate = date ?? getTodayDate();
  const { fertility, isLoading } = useCycleFertility(referenceDate);
  const predictionData = useCyclePredictionData(referenceDate);
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  const effectiveOvulationDate =
    fertility?.ovulationDate || predictionData?.prediction.cycles[0]?.ovulation || null;
  const effectiveFertileStart =
    fertility?.fertileWindow?.[0] || predictionData?.prediction.cycles[0]?.fertileStart || null;
  const effectiveFertileEnd =
    fertility?.fertileWindow?.slice(-1)[0] || predictionData?.prediction.cycles[0]?.fertileEnd || null;

  const dpo = useMemo(() => {
    if (!effectiveOvulationDate) return null;
    const diff = daysBetween(effectiveOvulationDate, referenceDate);
    return diff >= 0 ? diff : null;
  }, [effectiveOvulationDate, referenceDate]);

  const isFertileToday = useMemo(() => {
    if (fertility?.fertileWindow && fertility.fertileWindow.length > 0) {
      return fertility.fertileWindow.includes(referenceDate);
    }
    if (effectiveFertileStart && effectiveFertileEnd) {
      return referenceDate >= effectiveFertileStart && referenceDate <= effectiveFertileEnd;
    }
    return false;
  }, [fertility, effectiveFertileStart, effectiveFertileEnd, referenceDate]);

  const daysUntilNextPeriod = useMemo(() => {
    if (fertility?.daysUntilNextPeriod != null) {
      return fertility.daysUntilNextPeriod >= 0 ? fertility.daysUntilNextPeriod : null;
    }
    const nextStart = predictionData?.prediction.cycles[0]?.periodStart;
    if (nextStart != null) {
      const days = daysBetween(referenceDate, nextStart);
      return days >= 0 ? days : null;
    }
    return null;
  }, [fertility, predictionData, referenceDate]);

  if (isLoading && !predictionData) {
    return (
      <View className="bg-surface rounded-xl p-6 items-center shadow-sm border-0">
        <ActivityIndicator color={accentColor} />
      </View>
    );
  }

  // Hide card when neither server nor client predictions are present (Issue 14 empty state)
  if (!effectiveOvulationDate && !isFertileToday && daysUntilNextPeriod === null) {
    return null;
  }

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm border-0 gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-text-secondary text-sm font-semibold">Fertility</Text>
        {isFertileToday && (
          <View className="rounded-full bg-bg-success px-3 py-1">
            <Text className="text-text-success text-sm font-semibold">Est. fertile window</Text>
          </View>
        )}
      </View>

      <View className="flex-row justify-between">
        <View>
          <Text className="text-text-secondary text-sm">Est. ovulation</Text>
          <Text className="text-text-primary text-base font-bold">
            {effectiveOvulationDate ? formatDate(effectiveOvulationDate) : '—'}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-text-secondary text-sm">Next period in</Text>
          <Text className="text-text-primary text-base font-bold">
            {daysUntilNextPeriod != null ? `${daysUntilNextPeriod} days` : '—'}
          </Text>
        </View>
      </View>

      {dpo !== null && (
        <View className="rounded-xl bg-raised p-3">
          <Text className="text-text-secondary text-sm mb-0.5">Two-week wait</Text>
          <Text className="text-text-primary text-sm font-semibold">
            {dpo === 0 ? 'Ovulation day' : `${dpo} ${dpo === 1 ? 'day' : 'days'} past ovulation`}
          </Text>
          {dpo >= 1 && dpo < 14 && (
            <Text className="text-text-secondary text-sm mt-1">
              Home tests are usually most accurate 12 to 14 days past ovulation.
            </Text>
          )}
        </View>
      )}

      <Text className="text-text-secondary text-sm">
        Estimates from your logged data. Not medical advice.
      </Text>
    </View>
  );
};

export default FertilityCard;
