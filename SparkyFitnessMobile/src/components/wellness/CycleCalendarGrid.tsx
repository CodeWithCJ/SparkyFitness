import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { buildMonthGrid, addDays, compareDays, isHormonalBc } from '@workspace/shared';
import type { SharedCycle, SharedCycleDailyLog, SharedCycleSettings } from '@workspace/shared';
import Icon from '../Icon';
import { useWellnessTokens } from './theme/wellnessTokens';
import { getPhaseColor } from '../../utils/cycleDisplayUtils';

interface CycleCalendarGridProps {
  initialDate: string; // YYYY-MM-DD, seeds the visible month
  onDayPress: (date: string) => void;
  cycles: SharedCycle[];
  logs: SharedCycleDailyLog[];
  settings: SharedCycleSettings;
  /** Fires with the visible YYYY-MM on mount and after month navigation. */
  onMonthChange?: (month: string) => void;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const CycleCalendarGrid: React.FC<CycleCalendarGridProps> = ({
  initialDate,
  onDayPress,
  cycles,
  logs,
  settings,
  onMonthChange,
}) => {
  const tokens = useWellnessTokens();
  const [textPrimary, textMuted] = useCSSVariable([
    '--color-text-primary',
    '--color-text-muted',
  ]) as [string, string];
  const [currentMonth, setCurrentMonth] = useState(() => initialDate.slice(0, 7)); // YYYY-MM

  useEffect(() => {
    onMonthChange?.(currentMonth);
  }, [currentMonth, onMonthChange]);

  const { year, monthVal } = useMemo(() => {
    const parts = currentMonth.split('-').map(Number);
    return { year: parts[0] || 2026, monthVal: parts[1] || 7 };
  }, [currentMonth]);

  const { days: gridDates } = useMemo(
    () => buildMonthGrid(year, monthVal, 0), // 0 = Sunday
    [year, monthVal]
  );

  // Stats for prediction
  const stats = useMemo(() => {
    const completed = cycles.filter((c) => c.cycle_length && c.period_length);
    const cycleLengths = completed.map((c) => c.cycle_length!);
    const periodLengths = completed.map((c) => c.period_length!);

    return {
      avgCycleLength: settings?.avg_cycle_length_override ?? (cycleLengths.length
        ? Math.round(cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length)
        : 28),
      avgPeriodLength: settings?.avg_period_length_override ?? (periodLengths.length
        ? Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length)
        : 5),
    };
  }, [cycles, settings]);

  // Periods are not expected in these modes, so cycle predictions are hidden
  // entirely; fertility markers are additionally hidden on hormonal birth
  // control or when the user turns off the fertile window.
  const suppressPredictions =
    settings.mode === 'pregnant' ||
    settings.mode === 'postpartum' ||
    settings.mode === 'menopause';
  const suppressFertility =
    suppressPredictions ||
    isHormonalBc(settings.birth_control_method) ||
    settings.show_fertile_window === false;

  // Compute Predictions
  const predictions = useMemo(() => {
    if (suppressPredictions) return null;
    const lastCycle = cycles[0]; // descending order
    if (!lastCycle || !lastCycle.start_date) return null;

    const count = 4;
    const predictedCycles = [];
    let currentStart = lastCycle.start_date;
    const luteal = settings?.luteal_phase_length ?? 14;

    for (let i = 0; i < count; i++) {
      const nextStart = addDays(currentStart, stats.avgCycleLength);
      const nextEnd = addDays(nextStart, stats.avgPeriodLength - 1);

      let ovulation: string | null = null;
      let fertileStart: string | null = null;
      let fertileEnd: string | null = null;

      if (!suppressFertility) {
        ovulation = addDays(nextStart, -luteal);
        fertileStart = addDays(ovulation, -5);
        fertileEnd = addDays(ovulation, 1);
      }

      predictedCycles.push({
        periodStart: nextStart,
        periodEnd: nextEnd,
        ovulation,
        fertileStart,
        fertileEnd,
      });

      currentStart = nextStart;
    }

    return { cycles: predictedCycles };
  }, [cycles, stats, settings, suppressPredictions, suppressFertility]);

  // Decoration mapping for grid rendering
  const decoratedDaysMap = useMemo(() => {
    const map: Record<string, 'period' | 'predicted-period' | 'fertile' | 'ovulation' | 'none'> = {};

    // 1. Predicted days
    if (predictions) {
      predictions.cycles.forEach((pc) => {
        // Predicted period
        let start = pc.periodStart;
        while (compareDays(start, pc.periodEnd) <= 0) {
          map[start] = 'predicted-period';
          start = addDays(start, 1);
        }
        // Predicted fertile window
        if (pc.fertileStart && pc.fertileEnd) {
          let fStart = pc.fertileStart;
          while (compareDays(fStart, pc.fertileEnd) <= 0) {
            map[fStart] = 'fertile';
            fStart = addDays(fStart, 1);
          }
        }
        // Ovulation day
        if (pc.ovulation) {
          map[pc.ovulation] = 'ovulation';
        }
      });
    }

    // 2. Logged period days override predictions
    logs.forEach((log) => {
      const isPeriod =
        (log.flow_level && log.flow_level !== 'none') ||
        Object.keys(log.product_usage ?? {}).length > 0;
      if (isPeriod) {
        map[log.entry_date] = 'period';
      }
    });

    return map;
  }, [logs, predictions]);

  const loggedDays = useMemo(() => new Set(logs.map((log) => log.entry_date)), [logs]);

  const handlePrevMonth = () => {
    let nextMonth = monthVal - 1;
    let nextYear = year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }
    setCurrentMonth(`${nextYear}-${String(nextMonth).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    let nextMonth = monthVal + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setCurrentMonth(`${nextYear}-${String(nextMonth).padStart(2, '0')}`);
  };

  const monthName = new Date(year, monthVal - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm border-0">
      {/* Month Header Navigation */}
      <View className="flex-row justify-between items-center mb-4">
        <TouchableOpacity
          onPress={handlePrevMonth}
          accessibilityLabel="Previous month"
          className="p-2"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="chevron-back" size={20} color={textPrimary} />
        </TouchableOpacity>
        <Text className="text-text-primary text-base font-bold">{monthName}</Text>
        <TouchableOpacity
          onPress={handleNextMonth}
          accessibilityLabel="Next month"
          className="p-2"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="chevron-forward" size={20} color={textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Weekdays Headers */}
      <View className="flex-row mb-2">
        {WEEKDAYS.map((day, idx) => (
          <Text key={idx} className="flex-1 text-center text-text-secondary text-xs font-semibold py-1">
            {day}
          </Text>
        ))}
      </View>

      {/* Days Grid */}
      <View className="flex-row flex-wrap">
        {gridDates.map((dateStr) => {
          const hasLog = loggedDays.has(dateStr);
          const phase = decoratedDaysMap[dateStr] || 'none';
          const [,, dayNum] = dateStr.split('-').map(Number);
          const isCurrentMonth = dateStr.startsWith(currentMonth);

          // Class/Style mappings
          let cellBg = 'transparent';
          let textColor = textPrimary;
          let borderColor = 'transparent';
          let borderStyle: 'solid' | 'dashed' = 'solid';

          if (phase === 'period') {
            const pColor = getPhaseColor('menstrual', tokens);
            cellBg = pColor + '26'; // ~15% opacity
            textColor = pColor;
          } else if (phase === 'predicted-period') {
            const pColor = getPhaseColor('menstrual', tokens);
            cellBg = pColor + '14'; // ~8% opacity
            textColor = pColor;
            borderColor = pColor;
            borderStyle = 'dashed';
          } else if (phase === 'fertile') {
            const pColor = getPhaseColor('fertile', tokens);
            cellBg = pColor + '26';
            textColor = pColor;
          } else if (phase === 'ovulation') {
            const pColor = getPhaseColor('ovulation', tokens);
            cellBg = pColor + '26';
            textColor = pColor;
            borderColor = pColor;
          }

          if (!isCurrentMonth) {
            textColor = textMuted;
            if (cellBg !== 'transparent') {
              cellBg = textMuted + '15';
            }
          }

          return (
            <TouchableOpacity
              key={dateStr}
              onPress={() => onDayPress(dateStr)}
              style={{
                width: '14.28%',
                aspectRatio: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 4,
              }}
            >
              <View
                testID={`cycle-day-${dateStr}-${phase}`}
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: cellBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: borderColor !== 'transparent' ? 1.5 : 0,
                  borderColor,
                  borderStyle,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '500',
                    color: textColor,
                  }}
                >
                  {dayNum}
                </Text>
                {hasLog && (
                  <View
                    testID={`logged-dot-${dateStr}`}
                    style={{
                      position: 'absolute',
                      bottom: 6,
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: textColor,
                    }}
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Calendar Color Legend */}
      <View className="mt-4 pt-3 border-t border-border-subtle flex-row flex-wrap justify-between gap-y-2 px-1">
        <View className="flex-row items-center gap-1.5">
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: getPhaseColor('menstrual', tokens) + '35',
            }}
          />
          <Text className="text-text-secondary text-xs">Period</Text>
        </View>

        {!suppressPredictions && (
          <View className="flex-row items-center gap-1.5">
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: getPhaseColor('menstrual', tokens) + '26',
                borderWidth: 1,
                borderColor: getPhaseColor('menstrual', tokens),
                borderStyle: 'dashed',
              }}
            />
            <Text className="text-text-secondary text-xs">Predicted Period</Text>
          </View>
        )}

        {!suppressFertility && (
          <>
            <View className="flex-row items-center gap-1.5">
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: getPhaseColor('fertile', tokens) + '35',
                }}
              />
              <Text className="text-text-secondary text-xs">Fertile Window</Text>
            </View>

            <View className="flex-row items-center gap-1.5">
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: getPhaseColor('ovulation', tokens) + '26',
                  borderWidth: 1.5,
                  borderColor: getPhaseColor('ovulation', tokens),
                }}
              />
              <Text className="text-text-secondary text-xs">Est. Ovulation</Text>
            </View>
          </>
        )}

        <View className="flex-row items-center gap-1.5">
          <View
            style={{
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: textPrimary,
            }}
          />
          <Text className="text-text-secondary text-xs">Logged</Text>
        </View>
      </View>
    </View>
  );
};

export default CycleCalendarGrid;
