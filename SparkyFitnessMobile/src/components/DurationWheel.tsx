import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import { useCSSVariable } from 'uniwind';

interface DurationWheelProps {
  valueSec: number;
  onChangeSec: (seconds: number) => void;
  maxSec?: number;
}

function dateTypeToDate(date: DateType): Date | null {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (typeof date === 'object' && 'toDate' in date) return date.toDate();
  if (typeof date === 'string') return new Date(date);
  return new Date(date);
}

function secondsToDate(seconds: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const mins = Math.max(0, Math.floor(seconds / 60));
  d.setMinutes(mins);
  return d;
}

function dateToSeconds(date: Date): number {
  return date.getHours() * 3600 + date.getMinutes() * 60;
}

const WHEEL_ROW_HEIGHT = 44;

function splitSeconds(totalSec: number): { minuteSec: number; secondsPart: number } {
  const clamped = Math.max(0, totalSec);
  const minuteSec = Math.floor(clamped / 60) * 60;
  const secondsPart = clamped % 60;
  return { minuteSec, secondsPart };
}

function DurationWheel({ valueSec, onChangeSec, maxSec = 900 }: DurationWheelProps) {
  const [accentPrimary, textPrimary, borderSubtle, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
    '--color-border-subtle',
    '--color-text-muted',
  ]) as [string, string, string, string];

  const [minuteSec, setMinuteSec] = useState(() => splitSeconds(valueSec).minuteSec);
  const [secondsPart, setSecondsPart] = useState(() => splitSeconds(valueSec).secondsPart);
  const secondsListRef = useRef<FlatList<number>>(null);

  useEffect(() => {
    const next = splitSeconds(Math.max(0, Math.min(maxSec, valueSec)));
    setMinuteSec(next.minuteSec);
    setSecondsPart(next.secondsPart);
    secondsListRef.current?.scrollToOffset({
      offset: next.secondsPart * WHEEL_ROW_HEIGHT,
      animated: false,
    });
  }, [maxSec, valueSec]);

  const pickerStyles = useMemo(
    () => ({
      time_selector_label: { color: textPrimary, fontWeight: '600' as const },
      time_label: { color: textPrimary, fontSize: 24, fontWeight: '500' as const },
      time_selected_indicator: { backgroundColor: borderSubtle, borderRadius: 10 },
      selected_month: { backgroundColor: accentPrimary },
      selected_month_label: { color: '#FFFFFF' },
    }),
    [accentPrimary, textPrimary, borderSubtle],
  );

  const secondOptions = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const emitNext = (nextMinuteSec: number, nextSecondsPart: number) => {
    const total = nextMinuteSec + nextSecondsPart;
    const clamped = Math.max(0, Math.min(maxSec, total));
    const split = splitSeconds(clamped);
    setMinuteSec(split.minuteSec);
    setSecondsPart(split.secondsPart);
    onChangeSec(clamped);
    if (split.secondsPart !== nextSecondsPart) {
      secondsListRef.current?.scrollToOffset({
        offset: split.secondsPart * WHEEL_ROW_HEIGHT,
        animated: true,
      });
    }
  };

  const onSecondsScrollEnd = (offsetY: number) => {
    const raw = Math.round(offsetY / WHEEL_ROW_HEIGHT);
    const nextSeconds = Math.max(0, Math.min(59, raw));
    emitNext(minuteSec, nextSeconds);
  };

  return (
    <View className="flex-row items-center">
      <View style={{ flex: 1 }}>
        <DateTimePicker
          mode="single"
          date={secondsToDate(minuteSec)}
          timePicker
          initialView="time"
          hideHeader
          use12Hours={false}
          onChange={({ date }) => {
            const parsed = dateTypeToDate(date);
            if (!parsed || Number.isNaN(parsed.getTime())) return;
            emitNext(dateToSeconds(parsed), secondsPart);
          }}
          styles={pickerStyles}
          containerHeight={220}
        />
      </View>

      <View style={{ width: 90, height: 220 }}>
        <Text className="text-center text-xs font-semibold mb-1" style={{ color: textMuted }}>
          SEC
        </Text>
        <View style={{ flex: 1 }}>
          <FlatList
            ref={secondsListRef}
            data={secondOptions}
            keyExtractor={(item) => String(item)}
            getItemLayout={(_, index) => ({
              length: WHEEL_ROW_HEIGHT,
              offset: WHEEL_ROW_HEIGHT * index,
              index,
            })}
            initialScrollIndex={secondsPart}
            showsVerticalScrollIndicator={false}
            snapToInterval={WHEEL_ROW_HEIGHT}
            decelerationRate="fast"
            contentContainerStyle={{
              paddingVertical: WHEEL_ROW_HEIGHT * 2,
            }}
            onMomentumScrollEnd={(e) => onSecondsScrollEnd(e.nativeEvent.contentOffset.y)}
            renderItem={({ item }) => (
              <View style={{ height: WHEEL_ROW_HEIGHT }} className="items-center justify-center">
                <Text style={{ color: item === secondsPart ? textPrimary : textMuted, fontSize: 22 }}>
                  {String(item).padStart(2, '0')}
                </Text>
              </View>
            )}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: WHEEL_ROW_HEIGHT * 2,
              height: WHEEL_ROW_HEIGHT,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: borderSubtle,
              borderRadius: 8,
            }}
          />
        </View>
      </View>
    </View>
  );
}

export default DurationWheel;