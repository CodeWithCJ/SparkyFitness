import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import {
  DEFAULT_WARMUP_METHOD,
  WARMUP_DUMBBELL_ROUNDING_OPTIONS,
  WARMUP_METHOD_MAX_STEPS,
  WARMUP_METHOD_PERCENT_MAX,
  WARMUP_METHOD_REPS_MAX,
  WARMUP_PLATE_ROUNDING_OPTIONS,
  type WarmupMethodStep,
} from '@workspace/shared';

import BottomSheetPicker from '../components/BottomSheetPicker';
import SettingsRow from '../components/SettingsRow';
import Switch from '../components/ui/Switch';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { formatLocalizedNumber } from '../localization';
import type { RootStackScreenProps } from '../types/navigation';

type WarmupSettingsScreenProps = RootStackScreenProps<'WarmupSettings'>;

/** A whole number from what was typed, or null for an empty field. */
const parseWhole = (text: string): number | null => {
  const digits = text.replace(/[^0-9]/g, '');
  return digits === '' ? null : Number(digits);
};

interface StepFieldProps {
  value: number;
  max: number;
  suffix: string;
  label: string;
  onCommit: (value: number) => void;
  testID: string;
}

/**
 * One number of a method step. Keeps what is being typed as text and only
 * writes a number back on blur, so clearing the field to retype it does not
 * snap to the minimum on every keystroke.
 */
const StepField: React.FC<StepFieldProps> = ({
  value,
  max,
  suffix,
  label,
  onCommit,
  testID,
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const textPrimary = useCSSVariable('--color-text-primary') as string;
  return (
    <View className="flex-row items-center">
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={draft ?? String(value)}
        onChangeText={(text) =>
          setDraft(text.replace(/[^0-9]/g, '').slice(0, 3))
        }
        onBlur={() => {
          const parsed = parseWhole(draft ?? '');
          if (parsed != null && parsed >= 1) onCommit(Math.min(parsed, max));
          setDraft(null);
        }}
        keyboardType="number-pad"
        selectTextOnFocus
        className="font-semibold text-center bg-raised rounded-lg"
        // A line height taller than the font pushes the digits down inside a
        // fixed-height field on iOS; keep it equal and drop the padding so they
        // sit in the middle.
        style={{
          width: 56,
          height: 40,
          paddingVertical: 0,
          fontSize: 16,
          lineHeight: 16,
          color: textPrimary,
        }}
      />
      {suffix ? (
        <Text className="text-text-secondary text-base ml-1.5">{suffix}</Text>
      ) : null}
    </View>
  );
};

const WarmupSettingsScreen: React.FC<WarmupSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { preferences } = usePreferences();
  const unit: 'kg' | 'lbs' =
    preferences?.default_weight_unit === 'lbs' ||
    preferences?.default_weight_unit === 'st_lbs'
      ? 'lbs'
      : 'kg';

  const enabled = useAppPreferencesStore((s) => s.warmupCalculatorEnabled);
  const setEnabled = useAppPreferencesStore(
    (s) => s.setWarmupCalculatorEnabled
  );
  const method = useAppPreferencesStore((s) => s.warmupMethod);
  const setMethod = useAppPreferencesStore((s) => s.setWarmupMethod);
  const plateRounding = useAppPreferencesStore((s) => s.warmupPlateRounding);
  const setPlateRounding = useAppPreferencesStore(
    (s) => s.setWarmupPlateRounding
  );
  const dumbbellRounding = useAppPreferencesStore(
    (s) => s.warmupDumbbellRounding
  );
  const setDumbbellRounding = useAppPreferencesStore(
    (s) => s.setWarmupDumbbellRounding
  );
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];

  const header = useScreenHeader({
    title: t('warmupSettings.title', { defaultValue: 'Warm-up Calculator' }),
    left: { kind: 'back' },
  });

  const updateStep = (index: number, patch: Partial<WarmupMethodStep>) =>
    setMethod(
      method.map((step, i) => (i === index ? { ...step, ...patch } : step))
    );
  const addStep = () => {
    if (method.length >= WARMUP_METHOD_MAX_STEPS) return;
    const last = method[method.length - 1];
    // Continue the climb: a bit heavier and fewer reps than the last step.
    const percent = Math.min(
      (last?.percent ?? 40) + 10,
      WARMUP_METHOD_PERCENT_MAX
    );
    setMethod([
      ...method,
      { percent, reps: Math.max((last?.reps ?? 5) - 1, 1) },
    ]);
  };
  const removeStep = () => {
    if (method.length <= 1) return;
    setMethod(method.slice(0, -1));
  };

  const unitLabel = unit === 'lbs' ? 'lbs' : 'kg';
  const roundingLabel = (value: number) =>
    `${formatLocalizedNumber(value, { maximumFractionDigits: 2 })} ${unitLabel}`;
  const plateOptions = WARMUP_PLATE_ROUNDING_OPTIONS[unit].map((value) => ({
    label: roundingLabel(value),
    value,
  }));
  const dumbbellOptions = WARMUP_DUMBBELL_ROUNDING_OPTIONS[unit].map(
    (value) => ({ label: roundingLabel(value), value })
  );

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-4">
          {t('warmupSettings.description', {
            defaultValue:
              'Use the warm-up calculator to quickly add percentage-based warm-up sets to exercises.',
          })}
        </Text>

        <SettingsRow
          title={t('warmupSettings.enabled', {
            defaultValue: 'Warm-up Calculator',
          })}
          subtitle={t('warmupSettings.enabledSubtitle', {
            defaultValue:
              'When active, tap the three dots next to an exercise to add warm-up sets.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              testID="warmup-calculator-switch"
              value={enabled}
              onValueChange={setEnabled}
              accessibilityLabel={t('warmupSettings.enabledAccessibility', {
                defaultValue: 'Warm-up calculator',
              })}
            />
          }
        />

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-base font-semibold text-text-primary">
            {t('warmupSettings.method', { defaultValue: 'Warmup Method' })}
          </Text>
          <Text className="text-sm text-text-secondary mt-0.5 mb-3">
            {t('warmupSettings.methodSubtitle', {
              defaultValue:
                'Each warm-up set is a percent of your first working set, for a number of reps.',
            })}
          </Text>
          {method.map((step, index) => (
            <View
              key={index}
              testID={`warmup-method-step-${index}`}
              className="flex-row items-center justify-center py-2 border-t border-border-subtle"
            >
              <Text
                className="text-base font-bold mr-3"
                style={{ color: '#FACC15' }}
              >
                {t('warmupSettings.setLetter', { defaultValue: 'W' })}
              </Text>
              <StepField
                testID={`warmup-percent-${index}`}
                label={t('warmupSettings.percentLabel', {
                  defaultValue: 'Warm-up {{number}} percent',
                  number: index + 1,
                })}
                value={step.percent}
                max={WARMUP_METHOD_PERCENT_MAX}
                suffix="%"
                onCommit={(percent) => updateStep(index, { percent })}
              />
              <Text className="text-text-secondary text-base mx-3">×</Text>
              <StepField
                testID={`warmup-reps-${index}`}
                label={t('warmupSettings.repsLabel', {
                  defaultValue: 'Warm-up {{number}} reps',
                  number: index + 1,
                })}
                value={step.reps}
                max={WARMUP_METHOD_REPS_MAX}
                suffix=""
                onCommit={(reps) => updateStep(index, { reps })}
              />
            </View>
          ))}
          <View className="flex-row gap-2 mt-3">
            <Pressable
              testID="warmup-remove-set"
              accessibilityRole="button"
              disabled={method.length <= 1}
              onPress={removeStep}
              className="flex-1 bg-raised rounded-lg py-3 items-center active:opacity-70"
              style={{ opacity: method.length <= 1 ? 0.4 : 1 }}
            >
              <Text className="text-text-primary text-base font-semibold">
                {t('warmupSettings.removeSet', { defaultValue: 'Remove set' })}
              </Text>
            </Pressable>
            <Pressable
              testID="warmup-add-set"
              accessibilityRole="button"
              disabled={method.length >= WARMUP_METHOD_MAX_STEPS}
              onPress={addStep}
              className="flex-1 bg-raised rounded-lg py-3 items-center active:opacity-70"
              style={{
                opacity: method.length >= WARMUP_METHOD_MAX_STEPS ? 0.4 : 1,
              }}
            >
              <Text className="text-text-primary text-base font-semibold">
                {t('warmupSettings.addSet', { defaultValue: 'Add set' })}
              </Text>
            </Pressable>
          </View>
          <Pressable
            testID="warmup-reset"
            accessibilityRole="button"
            onPress={() => setMethod(DEFAULT_WARMUP_METHOD)}
            className="mt-2 py-3 items-center active:opacity-70"
          >
            <Text className="text-base font-semibold" style={{ color: accent }}>
              {t('warmupSettings.reset', { defaultValue: 'Reset to default' })}
            </Text>
          </Pressable>
        </View>

        <SettingsRow
          title={t('warmupSettings.plateRounding', {
            defaultValue: 'Plate rounding',
          })}
          subtitle={t('warmupSettings.plateRoundingSubtitle', {
            defaultValue:
              'Set preferred plate weight increments for your warm-up calculations.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <BottomSheetPicker
              value={plateRounding[unit]}
              options={plateOptions}
              onSelect={(value) => setPlateRounding(unit, value)}
              title={t('warmupSettings.plateRounding', {
                defaultValue: 'Plate rounding',
              })}
              containerStyle={{ width: 110 }}
            />
          }
        />
        <SettingsRow
          title={t('warmupSettings.dumbbellRounding', {
            defaultValue: 'Dumbbell rounding',
          })}
          subtitle={t('warmupSettings.dumbbellRoundingSubtitle', {
            defaultValue:
              'Set preferred dumbbell weight increments for your warm-up calculations.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <BottomSheetPicker
              value={dumbbellRounding[unit]}
              options={dumbbellOptions}
              onSelect={(value) => setDumbbellRounding(unit, value)}
              title={t('warmupSettings.dumbbellRounding', {
                defaultValue: 'Dumbbell rounding',
              })}
              containerStyle={{ width: 110 }}
            />
          }
        />
      </ScrollView>
    </View>
  );
};

export default WarmupSettingsScreen;
