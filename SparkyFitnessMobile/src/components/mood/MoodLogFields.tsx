import { useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  BUILT_IN_MOODS,
  moodByName,
  moodFaceValue,
  moodValueToTag,
} from '@workspace/shared';
import FormInput from '../FormInput';
import RatingSelector from './RatingSelector';
import { getBuiltInMoodLabels } from './moodLabels';
import { moodColorHex } from './moodColors';
import type { CustomMood } from '../../services/api/moodApi';

// The form sections of the mood log, shared by the one-entry-per-day form and
// the check-in composer.

const BANDED_MOODS = BUILT_IN_MOODS.filter((m) => m.band != null);

interface MoodFacePickerProps {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Tapping the selected face clears it, for check-ins where mood is optional. */
  clearable?: boolean;
}

/**
 * Overall mood: nine faces on the shared 10-100 scale, each writing its shared
 * face value (Sad 10 to Excited 90), the same value the web picker writes.
 */
export function MoodFacePicker({
  value,
  onChange,
  clearable = false,
}: MoodFacePickerProps) {
  const { t } = useTranslation();
  const labels = useMemo(() => getBuiltInMoodLabels(t), [t]);
  const currentBand =
    value === null ? undefined : moodByName(moodValueToTag(value));

  return (
    <View className="bg-surface border border-border p-3.5 rounded-2xl gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-text-primary">
          {t('mood.overall', { defaultValue: 'Overall mood' })}
        </Text>
        {currentBand && (
          <Text className="text-sm font-medium text-text-primary">
            {currentBand.emoji}{' '}
            {labels[currentBand.name] ?? currentBand.displayName}
          </Text>
        )}
      </View>
      <View className="flex-row justify-between">
        {BANDED_MOODS.map((mood) => {
          const active = currentBand?.name === mood.name;
          const label = labels[mood.name] ?? mood.displayName;
          return (
            <TouchableOpacity
              key={mood.name}
              onPress={() =>
                onChange(clearable && active ? null : moodFaceValue(mood.name))
              }
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              className={`w-9 h-9 items-center justify-center rounded-full ${
                active ? 'bg-accent-primary/15' : ''
              }`}
              style={{ opacity: active ? 1 : 0.45 }}
            >
              <Text style={{ fontSize: active ? 26 : 20 }}>{mood.emoji}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

interface MoodRatingFieldsProps {
  energy: number | null;
  onEnergyChange: (value: number | null) => void;
  focus: number | null;
  onFocusChange: (value: number | null) => void;
}

/** The 1-5 Energy and Focus taps. */
export function MoodRatingFields({
  energy,
  onEnergyChange,
  focus,
  onFocusChange,
}: MoodRatingFieldsProps) {
  const { t } = useTranslation();
  return (
    <View className="gap-4">
      <RatingSelector
        label={t('mood.energy', { defaultValue: 'Energy' })}
        value={energy}
        onChange={onEnergyChange}
        lowLabel={t('mood.energyLow', { defaultValue: 'Drained' })}
        highLabel={t('mood.energyHigh', { defaultValue: 'Energized' })}
      />
      <RatingSelector
        label={t('mood.focus', { defaultValue: 'Focus' })}
        value={focus}
        onChange={onFocusChange}
        lowLabel={t('mood.focusLow', { defaultValue: 'Scattered' })}
        highLabel={t('mood.focusHigh', { defaultValue: 'Locked in' })}
      />
    </View>
  );
}

interface MoodTagPickerProps {
  selected: string[];
  onChange: (tags: string[]) => void;
  customMoods: CustomMood[];
}

/** Mood tag chips: the built-in moods, then the user's own. */
export function MoodTagPicker({
  selected,
  onChange,
  customMoods,
}: MoodTagPickerProps) {
  const { t } = useTranslation();
  const labels = useMemo(() => getBuiltInMoodLabels(t), [t]);

  const toggle = (name: string) =>
    onChange(
      selected.includes(name)
        ? selected.filter((tag) => tag !== name)
        : [...selected, name]
    );

  const renderChip = (
    name: string,
    label: string,
    color: string | null | undefined
  ) => {
    const active = selected.includes(name);
    return (
      <TouchableOpacity
        key={name}
        onPress={() => toggle(name)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${
          active
            ? 'bg-accent-primary/10 border-accent-primary'
            : 'bg-surface border-border'
        }`}
      >
        <View
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: moodColorHex(color) }}
        />
        <Text className="text-xs font-semibold text-text-primary">{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View className="gap-2">
      <Text className="text-xs font-bold text-text-muted uppercase tracking-wider">
        {t('mood.tags', { defaultValue: 'Moods' })}
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        {BUILT_IN_MOODS.map((mood) =>
          renderChip(
            mood.name,
            `${mood.emoji} ${labels[mood.name] ?? mood.displayName}`,
            mood.color
          )
        )}
        {customMoods.map((mood) =>
          renderChip(
            mood.name,
            `${mood.icon ? `${mood.icon} ` : ''}${mood.display_name ?? mood.name}`,
            mood.color
          )
        )}
      </View>
    </View>
  );
}

interface MoodJournalFieldProps {
  value: string;
  onChangeText: (notes: string) => void;
}

export function MoodJournalField({
  value,
  onChangeText,
}: MoodJournalFieldProps) {
  const { t } = useTranslation();
  const label = t('mood.journalOptional', {
    defaultValue: 'Journal (optional)',
  });
  return (
    <View className="gap-2">
      <Text className="text-xs font-bold text-text-muted uppercase tracking-wider">
        {label}
      </Text>
      <FormInput
        value={value}
        onChangeText={onChangeText}
        placeholder={t('mood.journalPlaceholder', {
          defaultValue: "Any thoughts or feelings you'd like to add?",
        })}
        accessibilityLabel={label}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        style={{ minHeight: 120 }}
      />
    </View>
  );
}
