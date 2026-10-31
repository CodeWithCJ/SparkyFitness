import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { instantToDay } from '@workspace/shared';
import { getAppLocale } from '../../localization';
import {
  useSymptomEntriesDetailed,
  useSymptomFreeDays,
} from '../../hooks/useSymptoms';
import {
  monthGrid,
  shiftMonth,
  summarizeDays,
  type DayTone,
} from '../../utils/symptomReport';

interface SymptomCalendarProps {
  /** The highlighted day, `YYYY-MM-DD`. */
  selectedDate: string | null;
  /** Month shown first, `YYYY-MM-DD`. */
  initialDate: string;
  onSelectDate: (day: string | null) => void;
  /**
   * The profile timezone: where an episode's start and end fall on a day, and
   * the today an episode still going is marked up to.
   */
  timezone: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

const TONE_CLASS: Record<DayTone, string> = {
  free: 'bg-emerald-500/20',
  mild: 'bg-amber-500/25',
  severe: 'bg-red-500/35',
  none: '',
};

/**
 * A month of symptom history. Days marked symptom-free are green, days an
 * entry covers are tinted by the worst one (an episode tints every day from
 * its start to its end, or to today while it is still going), and days with
 * neither are left blank because they are unknown, not symptom-free.
 */
const SymptomCalendar: React.FC<SymptomCalendarProps> = ({
  selectedDate,
  initialDate,
  onSelectDate,
  timezone,
}) => {
  const { t } = useTranslation();
  // The clock is read when the calendar opens and again on each month change
  // or tapped day, and kept in state: the React Compiler caches what render
  // works out, so a today read there would stay on the old day after midnight.
  const [now, setNow] = useState(() => Date.now());
  const today = instantToDay(now, timezone);
  const toneLabels = {
    free: t('symptoms.calendar.free', { defaultValue: 'Symptom-free' }),
    mild: t('symptoms.calendar.mild', { defaultValue: 'Mild to moderate' }),
    severe: t('symptoms.calendar.severe', { defaultValue: 'Severe' }),
  } as const;
  const [year, setYear] = useState(() => Number(initialDate.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(initialDate.slice(5, 7)));
  const grid = monthGrid(year, month);

  const { entries } = useSymptomEntriesDetailed({
    fromDate: grid.first,
    toDate: grid.last,
    overlapping: true,
  });
  const { freeDays } = useSymptomFreeDays({
    fromDate: grid.first,
    toDate: grid.last,
  });
  const days = useMemo(
    () =>
      summarizeDays(entries, freeDays, {
        from: grid.first,
        to: grid.last,
        today,
        timezone,
      }),
    [entries, freeDays, grid.first, grid.last, today, timezone]
  );

  const shift = (delta: number) => {
    const next = shiftMonth(year, month, delta);
    setNow(Date.now());
    setYear(next.year);
    setMonth(next.month);
    if (
      selectedDate &&
      selectedDate.slice(0, 7) !== `${next.year}-${pad(next.month)}`
    ) {
      onSelectDate(null);
    }
  };

  const title = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
    getAppLocale(),
    { month: 'long', year: 'numeric', timeZone: 'UTC' }
  );
  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(getAppLocale(), {
          weekday: 'narrow',
          timeZone: 'UTC',
        })
      ),
    []
  );

  const cells: (number | null)[] = [
    ...Array.from({ length: grid.offset }, () => null),
    ...Array.from({ length: grid.count }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) =>
    cells.slice(r * 7, r * 7 + 7)
  );

  return (
    <View className="p-3.5 rounded-xl bg-surface border border-border mb-1">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-bold text-text-primary">{title}</Text>
        <View className="flex-row">
          <TouchableOpacity
            onPress={() => shift(-1)}
            accessibilityRole="button"
            accessibilityLabel={t('symptoms.calendar.previous', {
              defaultValue: 'Previous month',
            })}
            className="px-3 py-1"
          >
            <Text className="text-lg text-text-primary">‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => shift(1)}
            accessibilityRole="button"
            accessibilityLabel={t('symptoms.calendar.next', {
              defaultValue: 'Next month',
            })}
            className="px-3 py-1"
          >
            <Text className="text-lg text-text-primary">›</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-row mb-1">
        {weekdays.map((d, i) => (
          <Text
            key={i}
            className="flex-1 text-center text-[11px] text-text-muted"
          >
            {d}
          </Text>
        ))}
      </View>

      {rows.map((row, r) => (
        <View key={r} className="flex-row">
          {row.map((dayNum, c) => {
            if (dayNum == null)
              return <View key={c} className="flex-1 p-0.5" />;
            const day = `${year}-${pad(month)}-${pad(dayNum)}`;
            const summary = days.get(day);
            const selected = day === selectedDate;
            return (
              <View key={c} className="flex-1 p-0.5">
                <TouchableOpacity
                  onPress={() => {
                    setNow(Date.now());
                    onSelectDate(selected ? null : day);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    summary && summary.tone !== 'none'
                      ? `${day}, ${toneLabels[summary.tone]}`
                      : day
                  }
                  accessibilityState={{ selected }}
                  className={`aspect-square items-center justify-center rounded-md ${
                    summary ? TONE_CLASS[summary.tone] : ''
                  } ${selected ? 'border-2 border-accent-primary' : ''}`}
                >
                  <Text
                    className={`text-xs ${
                      summary?.tone === 'severe'
                        ? 'font-bold text-text-primary'
                        : 'text-text-secondary'
                    }`}
                  >
                    {dayNum}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      ))}

      <View className="flex-row flex-wrap mt-2">
        {(
          [
            ['free', 'bg-emerald-500/40'],
            ['mild', 'bg-amber-500/50'],
            ['severe', 'bg-red-500/60'],
          ] as const
        ).map(([tone, swatch]) => (
          <View key={tone} className="flex-row items-center mr-4 mb-1">
            <View className={`w-2.5 h-2.5 rounded-sm mr-1.5 ${swatch}`} />
            <Text className="text-[11px] text-text-muted">
              {toneLabels[tone]}
            </Text>
          </View>
        ))}
        <View className="flex-row items-center mb-1">
          <View className="w-2.5 h-2.5 rounded-sm mr-1.5 border border-border" />
          <Text className="text-[11px] text-text-muted">
            {t('symptoms.calendar.unknown', { defaultValue: 'No entry' })}
          </Text>
        </View>
      </View>
    </View>
  );
};

export default SymptomCalendar;
