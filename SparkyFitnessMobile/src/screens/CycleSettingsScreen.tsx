import React, { useCallback } from 'react';
import { View, Text, Switch, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useCycleSettings } from '../hooks/useCycleSettings';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';
import BottomSheetPicker from '../components/BottomSheetPicker';
import StepperInput from '../components/StepperInput';
import Button from '../components/ui/Button';

import {
  BIRTH_CONTROL_METHODS,
  CYCLE_CONDITIONS,
  CYCLE_DEFAULTS,
  type CycleMode,
} from '@workspace/shared';
import { getExport } from '../services/api/cycleApi';

type CycleSettingsScreenProps = RootStackScreenProps<'CycleSettings'>;

const MODE_OPTIONS = [
  { value: 'standard', label: 'Standard Cycle' },
  { value: 'ttc', label: 'Trying to Conceive' },
  { value: 'pregnant', label: 'Pregnancy Tracking' },
  { value: 'postpartum', label: 'Postpartum' },
  { value: 'menopause', label: 'Menopause-aware' },
];

const BC_OPTIONS = BIRTH_CONTROL_METHODS.map((m) => ({
  value: m.value,
  label: m.displayName,
}));

const TERMINOLOGY_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'neutral', label: 'Gender-Neutral' },
];

const CycleSettingsScreen: React.FC<CycleSettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [accentPrimary, formEnabled, formDisabled] = useCSSVariable([
    '--color-accent-primary',
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string, string];
  const usesNativeHeader = useNativeIOSHeadersActive();

  const {
    settings,
    isLoading,
    updateSettings,
    isUpdating,
  } = useCycleSettings();

  const handleToggleEnabled = useCallback((value: boolean) => {
    updateSettings({ enabled: value, mark_onboarded: value ? true : undefined });
  }, [updateSettings]);

  const handleModeChange = useCallback((value: string) => {
    updateSettings({ mode: value as CycleMode });
  }, [updateSettings]);

  const handleBcChange = useCallback((value: string) => {
    updateSettings({ birth_control_method: value });
  }, [updateSettings]);

  const handleToggleCondition = useCallback((condition: string, active: boolean) => {
    if (!settings) return;
    const conditions = [...(settings.conditions || [])];
    if (active) {
      if (!conditions.includes(condition)) {
        conditions.push(condition);
      }
    } else {
      const idx = conditions.indexOf(condition);
      if (idx >= 0) {
        conditions.splice(idx, 1);
      }
    }
    updateSettings({ conditions });
  }, [settings, updateSettings]);

  const handleToggleFertileWindow = useCallback((value: boolean) => {
    updateSettings({ show_fertile_window: value });
  }, [updateSettings]);

  const handleToggleDiscreetMode = useCallback((value: boolean) => {
    updateSettings({ discreet_mode: value });
  }, [updateSettings]);

  const handleTerminologyChange = useCallback((value: string) => {
    updateSettings({ terminology: value as 'default' | 'neutral' });
  }, [updateSettings]);

  const handleResetOnboarding = useCallback(() => {
    Alert.alert(
      'Reset Onboarding',
      'Are you sure you want to reset your cycle onboarding? This will clear your setup progress, but your logged cycle days will remain intact.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            updateSettings({ reset_onboarding: true });
            Toast.show({ type: 'success', text1: 'Onboarding reset completed.' });
          },
        },
      ]
    );
  }, [updateSettings]);

  const handleExportData = useCallback(async () => {
    try {
      Toast.show({ type: 'info', text1: 'Preparing Export', text2: 'Generating JSON export file...' });
      const data = await getExport();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `sparky-womens-health-${timestamp}.json`;
      const file = new File(Paths.cache, fileName);
      
      file.create();
      file.write(JSON.stringify(data, null, 2));

      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
      });
      file.delete();
    } catch (error) {
      addLog(`Failed to export cycle data: ${error}`, 'ERROR');
      Toast.show({ type: 'error', text1: 'Export Failed', text2: 'Could not export cycle data.' });
    }
  }, []);

  const header = useScreenHeader({
    title: settings?.discreet_mode ? 'Wellness Settings' : 'Cycle Settings',
    left: { kind: 'back' },
  });

  if (isLoading || !settings) {
    return (
      <View className="flex-1 bg-background justify-center items-center">
        <ActivityIndicator size="large" color={accentPrimary} />
      </View>
    );
  }

  const cycleLengthVal = settings.avg_cycle_length_override || CYCLE_DEFAULTS.cycleLength;
  const periodLengthVal = settings.avg_period_length_override || CYCLE_DEFAULTS.periodLength;
  const lutealLengthVal = settings.luteal_phase_length || CYCLE_DEFAULTS.lutealLength;

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >
        <SettingsRowGroup>
          <SettingsRow
            title="Enable Cycle & Pregnancy Tracking"
            subtitle="Turn on logging, predictions, and history"
            rightAccessory={
              <Switch
                value={settings.enabled}
                onValueChange={handleToggleEnabled}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
                disabled={isUpdating}
              />
            }
          />
        </SettingsRowGroup>

        {settings.enabled && (
          <>
            <Text className="text-base font-semibold text-text-primary mt-6 mb-2">
              Feature Configuration
            </Text>
            <SettingsRowGroup>
              <SettingsRow
                title="Tracking Mode"
                rightAccessory={
                  <BottomSheetPicker
                    value={settings.mode}
                    options={MODE_OPTIONS}
                    onSelect={handleModeChange}
                    title="Select Mode"
                    containerStyle={{ flex: 1, maxWidth: 200 }}
                  />
                }
              />
              <SettingsRow
                title="Birth Control Method"
                rightAccessory={
                  <BottomSheetPicker
                    value={settings.birth_control_method}
                    options={BC_OPTIONS}
                    onSelect={handleBcChange}
                    title="Select Method"
                    containerStyle={{ flex: 1, maxWidth: 200 }}
                  />
                }
              />
            </SettingsRowGroup>

            <Text className="text-base font-semibold text-text-primary mt-6 mb-2">
              Cycle Calculations Overrides
            </Text>
            <SettingsRowGroup>
              <SettingsRow
                title="Average Cycle Length"
                subtitle={settings.avg_cycle_length_override ? 'Custom override' : 'Default/History'}
                rightAccessory={
                  <StepperInput
                    value={String(cycleLengthVal)}
                    onChangeText={(text) => {
                      const v = parseInt(text, 10);
                      updateSettings({ avg_cycle_length_override: isNaN(v) ? null : v });
                    }}
                    onIncrement={() => updateSettings({ avg_cycle_length_override: cycleLengthVal + 1 })}
                    onDecrement={() => updateSettings({ avg_cycle_length_override: Math.max(15, cycleLengthVal - 1) })}
                    keyboardType="number-pad"
                  />
                }
              />
              <SettingsRow
                title="Average Period Length"
                subtitle={settings.avg_period_length_override ? 'Custom override' : 'Default/History'}
                rightAccessory={
                  <StepperInput
                    value={String(periodLengthVal)}
                    onChangeText={(text) => {
                      const v = parseInt(text, 10);
                      updateSettings({ avg_period_length_override: isNaN(v) ? null : v });
                    }}
                    onIncrement={() => updateSettings({ avg_period_length_override: periodLengthVal + 1 })}
                    onDecrement={() => updateSettings({ avg_period_length_override: Math.max(1, periodLengthVal - 1) })}
                    keyboardType="number-pad"
                  />
                }
              />
              <SettingsRow
                title="Luteal Phase Length"
                subtitle="Days post-ovulation (default 14)"
                rightAccessory={
                  <StepperInput
                    value={String(lutealLengthVal)}
                    onChangeText={(text) => {
                      const v = parseInt(text, 10);
                      updateSettings({ luteal_phase_length: isNaN(v) ? 14 : v });
                    }}
                    onIncrement={() => updateSettings({ luteal_phase_length: lutealLengthVal + 1 })}
                    onDecrement={() => updateSettings({ luteal_phase_length: Math.max(8, lutealLengthVal - 1) })}
                    keyboardType="number-pad"
                  />
                }
              />
            </SettingsRowGroup>

            <Text className="text-base font-semibold text-text-primary mt-6 mb-2">
              Conditions
            </Text>
            <SettingsRowGroup>
              {CYCLE_CONDITIONS.map((cond) => (
                <SettingsRow
                  key={cond.value}
                  title={cond.displayName}
                  rightAccessory={
                    <Switch
                      value={settings.conditions?.includes(cond.value) || false}
                      onValueChange={(val) => handleToggleCondition(cond.value, val)}
                      trackColor={{ false: formDisabled, true: formEnabled }}
                      thumbColor="#FFFFFF"
                      disabled={isUpdating}
                    />
                  }
                />
              ))}
            </SettingsRowGroup>

            <Text className="text-base font-semibold text-text-primary mt-6 mb-2">
              Display & Terminology
            </Text>
            <SettingsRowGroup>
              <SettingsRow
                title="Show Fertile Window"
                subtitle="Highlight fertile days on calendar"
                rightAccessory={
                  <Switch
                    value={settings.show_fertile_window}
                    onValueChange={handleToggleFertileWindow}
                    trackColor={{ false: formDisabled, true: formEnabled }}
                    thumbColor="#FFFFFF"
                    disabled={isUpdating}
                  />
                }
              />
              <SettingsRow
                title="Discreet Mode"
                subtitle='Hides "Cycle" or "Pregnancy" labels in UI'
                rightAccessory={
                  <Switch
                    value={settings.discreet_mode}
                    onValueChange={handleToggleDiscreetMode}
                    trackColor={{ false: formDisabled, true: formEnabled }}
                    thumbColor="#FFFFFF"
                    disabled={isUpdating}
                  />
                }
              />
              <SettingsRow
                title="Language / Terminology"
                rightAccessory={
                  <BottomSheetPicker
                    value={settings.terminology}
                    options={TERMINOLOGY_OPTIONS}
                    onSelect={handleTerminologyChange}
                    title="Select Terminology"
                    containerStyle={{ flex: 1, maxWidth: 200 }}
                  />
                }
              />
            </SettingsRowGroup>

            <Text className="text-base font-semibold text-text-primary mt-6 mb-2">
              Actions
            </Text>
            <View className="gap-3 mt-2">
              <Button variant="secondary" onPress={handleExportData}>
                Export Cycle & Pregnancy Data
              </Button>
              <Button variant="outline" tone="neutral" onPress={handleResetOnboarding}>
                Reset Onboarding Wizard
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

// Helper logger placeholder inside component scope
const addLog = (msg: string, level: 'INFO' | 'ERROR') => {
  console.log(`[CycleSettings] [${level}] ${msg}`);
};

export default CycleSettingsScreen;
