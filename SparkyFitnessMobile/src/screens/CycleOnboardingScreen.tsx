import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import { getTodayDate, addDays } from '../utils/dateUtils';

import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { useCycleSettings } from '../hooks/useCycleSettings';
import { usePregnancyMutations, useCurrentPregnancy } from '../hooks/usePregnancy';
import { bulkPutLogs } from '../services/api/cycleApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import StepperInput from '../components/StepperInput';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';

import {
  BIRTH_CONTROL_METHODS,
  CYCLE_CONDITIONS,
  eddFromLmp,
  type CycleMode,
} from '@workspace/shared';

type CycleOnboardingScreenProps = RootStackScreenProps<'CycleOnboarding'>;

const MODE_OPTIONS = [
  { value: 'standard', label: 'Standard Menstrual Cycle' },
  { value: 'ttc', label: 'Trying to Conceive (TTC)' },
  { value: 'pregnant', label: 'Pregnancy Tracking' },
  { value: 'postpartum', label: 'Postpartum / Recovery' },
  { value: 'menopause', label: 'Menopause Transition' },
];

const BC_OPTIONS = BIRTH_CONTROL_METHODS.map((m) => ({
  value: m.value,
  label: m.displayName,
}));

const CycleOnboardingScreen: React.FC<CycleOnboardingScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentColor, formEnabled, formDisabled] = useCSSVariable([
    '--color-accent-primary',
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string, string];

  const { updateSettingsAsync } = useCycleSettings();
  const { createPregnancyAsync, updatePregnancyAsync } = usePregnancyMutations();
  const { pregnancy: currentPregnancy } = useCurrentPregnancy();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form State
  const [mode, setMode] = useState<CycleMode>('standard');
  const [lastPeriodStart, setLastPeriodStart] = useState<string>(getTodayDate); // Default to today (device-local calendar day)
  const [cycleLength, setCycleLength] = useState(28);
  const [periodLength, setPeriodLength] = useState(5);
  const [birthControl, setBirthControl] = useState('none');
  const [conditions, setConditions] = useState<string[]>([]);

  // Refs
  const calendarSheetRef = useRef<CalendarSheetRef>(null);

  const handleToggleCondition = (cond: string, val: boolean) => {
    if (val) {
      setConditions((prev) => [...prev, cond]);
    } else {
      setConditions((prev) => prev.filter((c) => c !== cond));
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      // 1. Save Settings
      await updateSettingsAsync({
        enabled: true,
        mode,
        avg_cycle_length_override: cycleLength,
        avg_period_length_override: periodLength,
        birth_control_method: birthControl,
        conditions,
        mark_onboarded: true,
      });

      // 2. Seed Period Days (Standard/TTC Mode) or create Pregnancy Record (Pregnant Mode)
      if (mode === 'standard' || mode === 'ttc') {
        const seedLogs = [];
        for (let i = 0; i < periodLength; i++) {
          const dateStr = addDays(lastPeriodStart, i);
          const flow_level = i === 0 ? 'medium' : 'light';
          seedLogs.push({ date: dateStr, flow_level });
        }
        if (seedLogs.length > 0) {
          await bulkPutLogs(seedLogs);
        }
      } else if (mode === 'pregnant') {
        const computedDueDate = eddFromLmp(lastPeriodStart);
        try {
          await createPregnancyAsync({
            due_date: computedDueDate,
            due_date_basis: 'lmp',
            lmp_date: lastPeriodStart,
            conception_date: null,
            fetus_count: 1,
            status: 'active',
            notes: null,
          });
        } catch (pregErr) {
          if (currentPregnancy?.id) {
            await updatePregnancyAsync({
              id: currentPregnancy.id,
              body: {
                due_date: computedDueDate,
                due_date_basis: 'lmp',
                lmp_date: lastPeriodStart,
                status: 'active',
              },
            });
          } else {
            throw pregErr;
          }
        }
      }

      Toast.show({
        type: 'success',
        text1: 'Setup complete!',
        text2: 'Your wellness profile has been initialized.',
      });

      // Navigate to CycleHub
      navigation.replace('CycleHub');
    } catch (error) {
      console.log('[Onboarding] Failed to complete setup:', error);
      Toast.show({
        type: 'error',
        text1: 'Setup failed',
        text2: 'Could not complete onboarding. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const backEnabled = step > 1;

  const header = useScreenHeader({
    title: `Setup: Step ${step} of 4`,
    left: backEnabled ? { kind: 'primary', label: 'Back', onPress: () => setStep((s) => s - 1) } : undefined,
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 100,
        }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >
        {step === 1 && (
          <View className="gap-4">
            <Text className="text-xl font-bold text-text-primary">What is your tracking goal?</Text>
            <Text className="text-text-secondary text-sm mb-2">
              Select the mode that best fits your current health focus. You can change this anytime in settings.
            </Text>
            <SettingsRowGroup>
              {MODE_OPTIONS.map((opt) => {
                const isSelected = mode === opt.value;
                return (
                  <SettingsRow
                    key={opt.value}
                    title={opt.label}
                    onPress={() => setMode(opt.value as CycleMode)}
                    rightAccessory={
                      <Icon
                        name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                        size={24}
                        color={isSelected ? accentColor : formDisabled}
                      />
                    }
                  />
                );
              })}
            </SettingsRowGroup>
          </View>
        )}

        {step === 2 && (
          <View className="gap-4">
            <Text className="text-xl font-bold text-text-primary">Dates & Averages</Text>
            {mode === 'pregnant' ? (
              <View className="gap-4">
                <Text className="text-text-secondary text-sm">
                  Please specify the first day of your last menstrual period (LMP).
                </Text>
                <SettingsRowGroup>
                  <SettingsRow
                    title="Last Period Start (LMP)"
                    subtitle={lastPeriodStart}
                    onPress={() => calendarSheetRef.current?.present()}
                  />
                </SettingsRowGroup>
              </View>
            ) : mode === 'postpartum' || mode === 'menopause' ? (
              <View className="bg-surface rounded-xl p-4 shadow-sm border border-border-subtle">
                <Text className="text-text-primary text-base font-semibold mb-2">No configuration needed</Text>
                <Text className="text-text-secondary text-sm">
                  We will tailor your insights to hormonal recovery or menopause transition symptoms. Let&apos;s move on to the next step.
                </Text>
              </View>
            ) : (
              <View className="gap-4">
                <Text className="text-text-secondary text-sm">
                  Help us build predictions for your cycle.
                </Text>
                <SettingsRowGroup>
                  <SettingsRow
                    title="Last Period Start Date"
                    subtitle={lastPeriodStart}
                    onPress={() => calendarSheetRef.current?.present()}
                  />
                  <SettingsRow
                    title="Average Cycle Length"
                    rightAccessory={
                      <StepperInput
                        value={String(cycleLength)}
                        onChangeText={(t) => setCycleLength(parseInt(t, 10) || 28)}
                        onIncrement={() => setCycleLength((c) => c + 1)}
                        onDecrement={() => setCycleLength((c) => Math.max(15, c - 1))}
                      />
                    }
                  />
                  <SettingsRow
                    title="Average Period Length"
                    rightAccessory={
                      <StepperInput
                        value={String(periodLength)}
                        onChangeText={(t) => setPeriodLength(parseInt(t, 10) || 5)}
                        onIncrement={() => setPeriodLength((p) => p + 1)}
                        onDecrement={() => setPeriodLength((p) => Math.max(1, p - 1))}
                      />
                    }
                  />
                </SettingsRowGroup>
              </View>
            )}
          </View>
        )}

        {step === 3 && (
          <View className="gap-4">
            <Text className="text-xl font-bold text-text-primary">Profile & Conditions</Text>
            <Text className="text-text-secondary text-sm">
              Any underlying conditions or birth control methods? This helps filter health insights.
            </Text>
            <SettingsRowGroup>
              <SettingsRow
                title="Birth Control Method"
                rightAccessory={
                  <BottomSheetPicker
                    value={birthControl}
                    options={BC_OPTIONS}
                    onSelect={setBirthControl}
                    title="Select Method"
                    containerStyle={{ flex: 1, maxWidth: 200 }}
                  />
                }
              />
            </SettingsRowGroup>

            <Text className="text-base font-semibold text-text-primary mt-4 mb-2">Conditions</Text>
            <SettingsRowGroup>
              {CYCLE_CONDITIONS.map((cond) => (
                <SettingsRow
                  key={cond.value}
                  title={cond.displayName}
                  rightAccessory={
                    <Switch
                      value={conditions.includes(cond.value)}
                      onValueChange={(val) => handleToggleCondition(cond.value, val)}
                      trackColor={{ false: formDisabled, true: formEnabled }}
                      thumbColor="#FFFFFF"
                    />
                  }
                />
              ))}
            </SettingsRowGroup>
          </View>
        )}

        {step === 4 && (
          <View className="gap-4">
            <Text className="text-xl font-bold text-text-primary">Disclaimer & Complete</Text>
            <View className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <View className="flex-row items-center gap-2 mb-2">
                <Icon name="warning" size={18} color="#D97706" />
                <Text className="text-amber-800 font-bold">Medical Disclaimer</Text>
              </View>
              <Text className="text-amber-800 text-sm leading-5">
                The SparkyFitness Wellness and Reproductive Health Tracker is designed to help you track predictions, symptoms, and physiological parameters. It is NOT intended to be used as a contraceptive method or as a diagnostic/treatment tool.
                {"\n\n"}
                Always consult with a qualified medical professional for health concerns.
              </Text>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color={accentColor} className="mt-4" />
            ) : (
              <Button variant="primary" className="mt-4" onPress={handleComplete}>
                Accept & Initialize Profile
              </Button>
            )}
          </View>
        )}
      </ScrollView>

      {/* Navigation Buttons for step-wise */}
      {step < 4 && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: 16,
            paddingBottom: Math.max(insets.bottom, 16),
            backgroundColor: 'transparent',
          }}
        >
          <Button variant="primary" onPress={() => setStep((s) => s + 1)}>
            Next Step
          </Button>
        </View>
      )}

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={lastPeriodStart}
        onSelectDate={setLastPeriodStart}
      />
    </View>
  );
};

export default CycleOnboardingScreen;
