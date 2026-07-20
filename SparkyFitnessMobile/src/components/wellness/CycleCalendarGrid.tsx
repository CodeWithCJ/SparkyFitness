import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { buildMonthGrid, addDays, compareDays, isHormonalBc } from '@workspace/shared';
import type { SharedCycle, SharedCycleDailyLog, SharedCycleSettings } from '@workspace/shared';
import Icon from '../Icon';
import { useWellnessTokens } from './theme/wellnessTokens';

interface CycleCalendarGridProps {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  cycles: SharedCycle[];
  logs: SharedCycleDailyLog[];
  settings: SharedCycleSettings;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const CycleCalendarGrid: React.FC<CycleCalendarGridProps> = ({
  selectedDate,
  onSelectDate,
  cycles,
  logs,
  settings,
}) => {
  const tokens = useWellnessTokens();
  const [textPrimary, textMuted] = useCSSVariable([
    '--color-text-primary',
    '--color-text-muted',
  ]) as [string, string];
  const [currentMonth, setCurrentMonth] = useState(() => selectedDate.slice(0, 7)); // YYYY-MM

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

  // Compute Predictions
  const predictions = useMemo(() => {
    const lastCycle = cycles[0]; // descending order
    if (!lastCycle || !lastCycle.start_date) return null;

    const suppressFertility =
      isHormonalBc(settings.birth_control_method) ||
      settings.show_fertile_window === false ||
      settings.mode === 'pregnant' ||
      settings.mode === 'postpartum' ||
      settings.mode === 'menopause';

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
  }, [cycles, stats, settings]);

  // Decoration mapping for grid rendering
  const decoratedDaysMap = useMemo(() => {
    const map: Record<string, 'period' | 'predicted-period' | 'fertile' | 'ovulation' | 'none'> = {};

    // 1. Predicted days
    if (predictions && settings?.show_fertile_window !== false) {
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
  }, [logs, predictions, settings]);

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
    <View className="bg-surface rounded-2xl p-4 shadow-sm border border-border-subtle">
      {/* Month Header Navigation */}
      <View className="flex-row justify-between items-center mb-4">
        <TouchableOpacity onPress={handlePrevMonth} className="p-2" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Icon name="chevron-back" size={20} color={textPrimary} />
        </TouchableOpacity>
        <Text className="text-text-primary text-base font-bold">{monthName}</Text>
        <TouchableOpacity onPress={handleNextMonth} className="p-2" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
          const isSelected = dateStr === selectedDate;
          const phase = decoratedDaysMap[dateStr] || 'none';
          const [,, dayNum] = dateStr.split('-').map(Number);
          const isCurrentMonth = dateStr.startsWith(currentMonth);

          // Class/Style mappings
          let cellBg = 'transparent';
          let textColor = textPrimary;
          let borderColor = 'transparent';
          let borderStyle: 'solid' | 'dashed' = 'solid';

          if (phase === 'period') {
            cellBg = '#FDEDE9';
            textColor = tokens.phaseMenstrual;
          } else if (phase === 'predicted-period') {
            cellBg = '#FFF5F3';
            textColor = tokens.phaseMenstrual;
            borderColor = tokens.phaseMenstrual;
            borderStyle = 'dashed';
          } else if (phase === 'fertile') {
            cellBg = '#E9F3E6';
            textColor = tokens.phaseFollicular;
          } else if (phase === 'ovulation') {
            cellBg = '#E5F0FB';
            textColor = tokens.phaseOvulation;
            borderColor = tokens.phaseOvulation;
          }

          if (!isCurrentMonth) {
            textColor = textMuted;
            if (cellBg !== 'transparent') {
              cellBg = 'rgba(230, 230, 230, 0.4)';
            }
          }

          return (
            <TouchableOpacity
              key={dateStr}
              onPress={() => onSelectDate(dateStr)}
              style={{
                width: '14.28%',
                aspectRatio: 1,
                alignItems: 'center',
                justifyContent: 'center',
                padding: 4,
              }}
            >
              <View
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: cellBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: isSelected || borderColor !== 'transparent' ? 1.5 : 0,
                  borderColor: isSelected ? textPrimary : borderColor,
                  borderStyle,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: isSelected ? 'bold' : '500',
                    color: isSelected ? textPrimary : textColor,
                  }}
                >
                  {dayNum}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default CycleCalendarGrid;
