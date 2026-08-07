import React, { useCallback } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useCycleSettings } from '../hooks/useCycleSettings';
import { useDiscreetMode } from '../hooks/useDiscreetMode';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { addLog } from '../services/LogService';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';
import BottomSheetPicker from '../components/BottomSheetPicker';
import StepperInput, { useStepperDraft } from '../components/StepperInput';
import Switch from '../components/ui/Switch';
import { CYCLE_SETTING_LIMITS } from '../utils/cycleDisplayUtils';

import {
  BIRTH_CONTROL_METHODS,
  CYCLE_CONDITIONS,
  CYCLE_DEFAULTS,
  type CycleMode,
} from '@workspace/shared';
import { getExport } from '../services/api/cycleApi';

type CycleSettingsScreenProps = RootStackScreenProps<'CycleSettings'>;

const MODE_OPTIONS = ['standard', 'ttc', 'pregnant', 'postpartum', 'menopause'] as const;

const modeLabel = (value: (typeof MODE_OPTIONS)[number], t: (key: string) => string): string => {
  switch (value) {
    case 'standard': return t('mobileComponents.wellness.settings.standard');
    case 'ttc': return t('mobileComponents.wellness.settings.ttc');
    case 'pregnant': return t('mobileComponents.wellness.settings.pregnant');
    case 'postpartum': return t('mobileComponents.wellness.settings.postpartum');
    case 'menopause': return t('mobileComponents.wellness.settings.menopause');
  }
};

const BC_OPTIONS = BIRTH_CONTROL_METHODS.map((m) => ({
  value: m.value,
  label: m.displayName,
}));

const TERMINOLOGY_OPTIONS = ['default', 'neutral'] as const;

const CycleSettingsScreen: React.FC<CycleSettingsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const {
    settings,
    isLoading,
    updateSettings,
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
      t('mobileComponents.wellness.settings.resetTitle'),
      t('mobileComponents.wellness.settings.resetBodyAlert'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('mobileComponents.wellness.settings.reset'),
          style: 'destructive',
          onPress: () => {
            updateSettings({ reset_onboarding: true });
            Toast.show({ type: 'success', text1: t('mobileComponents.wellness.settings.resetDone') });
          },
        },
      ]
    );
  }, [updateSettings, t]);

  const handleExportData = useCallback(async () => {
    try {
      Toast.show({ type: 'info', text1: t('mobileComponents.wellness.settings.preparing'), text2: t('mobileComponents.wellness.settings.generating') });
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
      Toast.show({ type: 'error', text1: t('mobileComponents.wellness.settings.exportFailed'), text2: t('mobileComponents.wellness.settings.exportError') });
    }
  }, [t]);

  const cycleLengthVal = settings?.avg_cycle_length_override || CYCLE_DEFAULTS.cycleLength;
  const periodLengthVal = settings?.avg_period_length_override || CYCLE_DEFAULTS.periodLength;
  const lutealLengthVal = settings?.luteal_phase_length || CYCLE_DEFAULTS.lutealLength;

  const cycleLengthProps = useStepperDraft({
    value: cycleLengthVal,
    ...CYCLE_SETTING_LIMITS.cycleLength,
    onCommit: (value) => updateSettings({ avg_cycle_length_override: value }),
    onClear: () => updateSettings({ avg_cycle_length_override: null }),
  });

  const periodLengthProps = useStepperDraft({
    value: periodLengthVal,
    ...CYCLE_SETTING_LIMITS.periodLength,
    onCommit: (value) => updateSettings({ avg_period_length_override: value }),
    onClear: () => updateSettings({ avg_period_length_override: null }),
  });

  const lutealLengthProps = useStepperDraft({
    value: lutealLengthVal,
    ...CYCLE_SETTING_LIMITS.lutealLength,
    onCommit: (value) => updateSettings({ luteal_phase_length: value }),
  });

  const { discreetMode } = useDiscreetMode();

  const header = useScreenHeader({
    title: discreetMode ? t('mobileComponents.wellness.settings.wellnessTitle') : t('mobileComponents.wellness.settings.title'),
    nativeTitle: discreetMode ? t('mobileComponents.wellness.settings.wellnessTitle') : t('mobileComponents.wellness.settings.title'),
    left: { kind: 'back' },
  });

  if (isLoading || !settings) {
    return <StatusView loading className="bg-background" />;
  }

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
             title={t('mobileComponents.wellness.settings.enable')}
             subtitle={t('mobileComponents.wellness.settings.enableBody')}
            rightAccessory={
              <Switch
                value={settings.enabled}
                onValueChange={handleToggleEnabled}
              />
            }
          />
        </SettingsRowGroup>

        {settings.enabled && (
          <>
            <SettingsRowGroup title={t('mobileComponents.wellness.settings.configuration')}>
              <SettingsRow
                 title={t('mobileComponents.wellness.settings.mode')}
                rightAccessory={
                  <BottomSheetPicker
                    value={settings.mode}
                     options={MODE_OPTIONS.map((value) => ({ value, label: modeLabel(value, t) }))}
                    onSelect={handleModeChange}
                     title={t('mobileComponents.wellness.settings.selectMode')}
                    containerStyle={{ flex: 1, maxWidth: 200 }}
                  />
                }
              />
              <SettingsRow
                 title={t('mobileComponents.wellness.settings.birthControl')}
                rightAccessory={
                  <BottomSheetPicker
                    value={settings.birth_control_method}
                    options={BC_OPTIONS}
                    onSelect={handleBcChange}
                     title={t('mobileComponents.wellness.settings.selectMethod')}
                    containerStyle={{ flex: 1, maxWidth: 200 }}
                  />
                }
              />
            </SettingsRowGroup>

             <SettingsRowGroup title={t('mobileComponents.wellness.settings.calculations')}>
              <SettingsRow
                 title={t('mobileComponents.wellness.onboarding.avgCycle')}
                 subtitle={settings.avg_cycle_length_override ? t('mobileComponents.wellness.settings.custom') : t('mobileComponents.wellness.settings.default')}
                rightAccessory={
                  <StepperInput {...cycleLengthProps} keyboardType="number-pad" />
                }
              />
              <SettingsRow
                 title={t('mobileComponents.wellness.onboarding.avgPeriod')}
                 subtitle={settings.avg_period_length_override ? t('mobileComponents.wellness.settings.custom') : t('mobileComponents.wellness.settings.default')}
                rightAccessory={
                  <StepperInput {...periodLengthProps} keyboardType="number-pad" />
                }
              />
              <SettingsRow
                 title={t('mobileComponents.wellness.settings.luteal')}
                 subtitle={t('mobileComponents.wellness.settings.lutealBody')}
                rightAccessory={
                  <StepperInput {...lutealLengthProps} keyboardType="number-pad" />
                }
              />
            </SettingsRowGroup>

            <SettingsRowGroup
               title={t('mobileComponents.wellness.settings.conditions')}
               subtitle={t('mobileComponents.wellness.settings.conditionsBody')}
            >
              {CYCLE_CONDITIONS.map((cond) => (
                <SettingsRow
                  key={cond.value}
                  title={cond.displayName}
                  rightAccessory={
                    <Switch
                      value={settings.conditions?.includes(cond.value) || false}
                      onValueChange={(val) => handleToggleCondition(cond.value, val)}
                    />
                  }
                />
              ))}
            </SettingsRowGroup>

             <SettingsRowGroup title={t('mobileComponents.wellness.settings.display')}>
              <SettingsRow
                 title={t('mobileComponents.wellness.settings.fertile')}
                 subtitle={t('mobileComponents.wellness.settings.fertileBody')}
                rightAccessory={
                  <Switch
                    value={settings.show_fertile_window}
                    onValueChange={handleToggleFertileWindow}
                  />
                }
              />
              <SettingsRow
                 title={t('mobileComponents.wellness.settings.discreet')}
                 subtitle={t('mobileComponents.wellness.settings.discreetBody')}
                rightAccessory={
                  <Switch
                    value={settings.discreet_mode}
                    onValueChange={handleToggleDiscreetMode}
                  />
                }
              />
              <SettingsRow
                 title={t('mobileComponents.wellness.settings.terminology')}
                rightAccessory={
                  <BottomSheetPicker
                    value={settings.terminology}
                     options={TERMINOLOGY_OPTIONS.map((value) => ({ value, label: value === 'default' ? t('mobileComponents.wellness.settings.defaultTerm') : t('mobileComponents.wellness.settings.neutral') }))}
                    onSelect={handleTerminologyChange}
                     title={t('mobileComponents.wellness.settings.selectTerminology')}
                    containerStyle={{ flex: 1, maxWidth: 200 }}
                  />
                }
              />
            </SettingsRowGroup>

             <SettingsRowGroup title={t('mobileComponents.wellness.settings.actions')}>
              <SettingsRow
                 title={t('mobileComponents.wellness.settings.export')}
                 subtitle={t('mobileComponents.wellness.settings.exportBody')}
                onPress={handleExportData}
              />
              <SettingsRow
                 title={t('mobileComponents.wellness.settings.reset')}
                 subtitle={t('mobileComponents.wellness.settings.resetBody')}
                onPress={handleResetOnboarding}
              />
            </SettingsRowGroup>
          </>
        )}
      </ScrollView>
    </View>
  );
};

export default CycleSettingsScreen;
