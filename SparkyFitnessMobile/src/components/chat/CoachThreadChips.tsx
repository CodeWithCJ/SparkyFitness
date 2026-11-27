import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCoachSettings } from '../../hooks/useCoaches';
import { coachName } from '../../utils/coachLabels';

/** Sparky and each coach that has a thread, with a dot for unread messages. */
export default function CoachThreadChips({
  activeCoachId,
  onSelect,
}: {
  activeCoachId: string | null;
  onSelect: (coachId: string | null) => void;
}) {
  const { t } = useTranslation();
  const { data } = useCoachSettings();
  const coaches = (data?.coaches ?? []).filter(
    (coach) => coach.id && (coach.enabled || coach.unread > 0)
  );
  if (coaches.length === 0) return null;
  const options = [
    {
      id: null as string | null,
      label: t('coaches.thread.sparky', { defaultValue: 'Sparky' }),
      unread: 0,
    },
    ...coaches.map((coach) => ({
      id: coach.id,
      label: coachName(t, coach.builtin_key, coach.name),
      unread: coach.unread,
    })),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
      className="grow-0 py-2"
    >
      {options.map((option) => {
        const selected = option.id === activeCoachId;
        return (
          <Pressable
            key={option.id ?? 'sparky'}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            testID={`coach-chip-${option.id ?? 'sparky'}`}
            onPress={() => onSelect(option.id)}
            className={`rounded-full border px-3 py-1 ${
              selected
                ? 'border-accent-primary bg-accent-primary'
                : 'border-border-subtle bg-surface'
            }`}
          >
            <Text
              className={`text-sm ${selected ? 'text-white' : 'text-text-primary'}`}
            >
              {option.label}
            </Text>
            {option.unread > 0 && (
              <View className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500" />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
