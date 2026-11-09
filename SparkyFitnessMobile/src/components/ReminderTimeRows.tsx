import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import SettingsRow from './SettingsRow';
import TimeSheet, { type TimeSheetRef } from './TimeSheet';
import { formatTimeLabel } from '../utils/entryTimeDisplay';

export interface ReminderTimeLabels {
  /** "Reminder 2" */
  reminder: (number: number) => string;
  /** "Reminder 2, 9:00 PM" */
  reminderA11y: (number: number, time: string) => string;
  /** "Remove reminder 2" */
  remove: (number: number) => string;
  add: string;
}

interface Options {
  times: string[];
  onChangeTimes: (times: string[]) => void;
  maxTimes: number;
  timeFormat: Parameters<typeof formatTimeLabel>[1];
  labels: ReminderTimeLabels;
}

/**
 * Editable daily reminder times for a settings group: one row per time (tap to
 * change, × to remove while more than one is left) and an Add row up to
 * `maxTimes`. Returns the rows to place inside a `SettingsRowGroup` and the time
 * sheet to render once at the screen root.
 */
export function useReminderTimeRows({
  times,
  onChangeTimes,
  maxTimes,
  timeFormat,
  labels,
}: Options): { rows: React.ReactNode[]; sheet: React.ReactNode } {
  const [secondaryColor] = useCSSVariable(['--color-text-secondary']) as [
    string,
  ];
  const sheetRef = useRef<TimeSheetRef>(null);
  // `nonce` makes reopening the same row a fresh request; the sheet reads its
  // value at present() time, so presenting waits for the render that applies it.
  const [editing, setEditing] = useState<{
    index: number;
    nonce: number;
  } | null>(null);

  useEffect(() => {
    if (editing) sheetRef.current?.present();
  }, [editing]);

  const openSheet = useCallback((index: number) => {
    setEditing((prev) => ({ index, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const handleSelect = useCallback(
    (time: string) => {
      if (!editing) return;
      const next = [...times];
      next[editing.index] = time;
      onChangeTimes(next);
    },
    [editing, times, onChangeTimes]
  );

  const handleRemove = useCallback(
    (index: number) => onChangeTimes(times.filter((_, i) => i !== index)),
    [times, onChangeTimes]
  );

  const handleAdd = useCallback(() => {
    // Start at noon and take the first free hour after it (wrapping).
    let newTime = '12:00';
    for (let offset = 0; offset < 24; offset++) {
      const candidate = `${String((12 + offset) % 24).padStart(2, '0')}:00`;
      if (!times.includes(candidate)) {
        newTime = candidate;
        break;
      }
    }
    const next = [...times, newTime].sort();
    onChangeTimes(next);
    openSheet(next.indexOf(newTime));
  }, [times, onChangeTimes, openSheet]);

  const rows: React.ReactNode[] = times.map((time, index) => {
    const timeLabel = formatTimeLabel(time, timeFormat);
    const removeLabel = labels.remove(index + 1);
    const canRemove = times.length > 1;
    return (
      <SettingsRow
        key={time}
        title={labels.reminder(index + 1)}
        accessibilityLabel={labels.reminderA11y(index + 1, timeLabel ?? time)}
        // The visible remove button sits inside the row's accessible
        // Pressable, which screen readers can't reach.
        accessibilityActions={
          canRemove ? [{ name: 'remove', label: removeLabel }] : undefined
        }
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'remove') handleRemove(index);
        }}
        onPress={() => openSheet(index)}
        rightAccessory={
          <View className="flex-row items-center">
            <Text className="text-sm text-text-secondary">{timeLabel}</Text>
            {canRemove && (
              <Pressable
                onPress={() => handleRemove(index)}
                accessibilityRole="button"
                accessibilityLabel={removeLabel}
                hitSlop={14}
                className="ml-3"
              >
                <Icon name="close" size={18} color={secondaryColor} />
              </Pressable>
            )}
          </View>
        }
      />
    );
  });

  if (times.length < maxTimes) {
    rows.push(
      <SettingsRow
        key="add"
        icon="add"
        title={labels.add}
        onPress={handleAdd}
        rightAccessory={null}
      />
    );
  }

  const sheet = (
    <TimeSheet
      ref={sheetRef}
      value={editing ? (times[editing.index] ?? '') : ''}
      onSelectTime={handleSelect}
      commitOn="done"
    />
  );

  return { rows, sheet };
}
