import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { checklistForWeek, CHECKLIST_TEMPLATES } from '@workspace/shared';
import { usePregnancyChecklist, usePregnancyChecklistMutations } from '../../../hooks/usePregnancyChecklist';
import SettingsRow, { SettingsRowGroup } from '../../SettingsRow';
import Icon from '../../Icon';
import { useCSSVariable } from 'uniwind';

interface WeeklyChecklistProps {
  pregnancyId: string;
  currentWeek: number;
}

interface ChecklistRow {
  key: string;
  title: string;
  week: number;
  completed: boolean;
  persistedId?: string;
}

/**
 * Merges the shared week-window templates (checklistForWeek) with any
 * persisted server rows. Items already completed stay visible even after
 * their window closes, so users don't lose sight of what they checked off.
 */
const WeeklyChecklist: React.FC<WeeklyChecklistProps> = ({ pregnancyId, currentWeek }) => {
  const { items, isLoading } = usePregnancyChecklist(pregnancyId);
  const { toggleAsync } = usePregnancyChecklistMutations();
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  const rows = useMemo<ChecklistRow[]>(() => {
    const inWindow = checklistForWeek(currentWeek);
    const byKey = new Map(items.filter((i) => i.template_key).map((i) => [i.template_key as string, i]));

    const windowRows: ChecklistRow[] = inWindow.map((tpl) => {
      const persisted = byKey.get(tpl.key);
      return {
        key: tpl.key,
        title: tpl.title,
        week: currentWeek,
        completed: !!persisted?.completed_at,
        persistedId: persisted?.id,
      };
    });

    // Include previously-completed items whose window has already passed so
    // they don't silently disappear once checked off.
    const windowKeys = new Set(inWindow.map((t) => t.key));
    const pastCompleted: ChecklistRow[] = items
      .filter((i) => i.template_key && i.completed_at && !windowKeys.has(i.template_key))
      .map((i) => {
        const tpl = CHECKLIST_TEMPLATES.find((t) => t.key === i.template_key);
        return {
          key: i.template_key as string,
          title: tpl?.title ?? i.custom_title ?? i.template_key ?? 'Checklist item',
          week: i.week ?? currentWeek,
          completed: true,
          persistedId: i.id,
        };
      });

    return [...windowRows, ...pastCompleted];
  }, [items, currentWeek]);

  const handleToggle = (row: ChecklistRow) => {
    toggleAsync({
      id: row.persistedId,
      pregnancyId,
      templateKey: row.key,
      week: row.week,
      completed: !row.completed,
    });
  };

  return (
    <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-sm gap-2">
      <Text className="text-text-primary text-base font-bold mb-1">This Week&apos;s To-Do</Text>
      {isLoading ? (
        <ActivityIndicator color={accentColor} />
      ) : rows.length === 0 ? (
        <Text className="text-text-secondary text-xs italic py-2">
          Nothing on your checklist for this week.
        </Text>
      ) : (
        <SettingsRowGroup>
          {rows.map((row) => (
            <SettingsRow
              key={row.key}
              title={row.title}
              onPress={() => handleToggle(row)}
              rightAccessory={
                <Icon
                  name={row.completed ? 'checkmark-circle-filled' : 'checkmark-circle'}
                  size={24}
                  color={row.completed ? accentColor : textMuted}
                />
              }
            />
          ))}
        </SettingsRowGroup>
      )}
    </View>
  );
};

export default WeeklyChecklist;
