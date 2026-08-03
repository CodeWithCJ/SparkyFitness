import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
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

const CycleOnboardingScreen: React.FC<CycleOnboardingScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
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
         text1: t('mobileComponents.wellness.onboarding.success'),
         text2: t('mobileComponents.wellness.onboarding.successBody'),
      });

      // Navigate to CycleHub
      navigation.replace('CycleHub');
    } catch (error) {
      console.log('[Onboarding] Failed to complete setup:', error);
      Toast.show({
        type: 'error',
         text1: t('mobileComponents.wellness.onboarding.failed'),
         text2: t('mobileComponents.wellness.onboarding.failedBody'),
      });
    } finally {
      setLoading(false);
    }
  };

  const header = useScreenHeader({
    title: t('mobileComponents.wellness.onboarding.step', { step }),
    left: step > 1
      ? { kind: 'primary', label: t('mobileComponents.wellness.onboarding.back'), onPress: () => setStep((s) => s - 1) }
      : { kind: 'primary', label: t('mobileComponents.wellness.onboarding.back'), onPress: () => navigation.goBack() },
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
             <Text className="text-xl font-bold text-text-primary">{t('mobileComponents.wellness.onboarding.goal')}</Text>
            <Text className="text-text-secondary text-sm mb-2">
               {t('mobileComponents.wellness.onboarding.goalBody')}
            </Text>
            <SettingsRowGroup>
               {MODE_OPTIONS.map((value) => {
                 const isSelected = mode === value;
                return (
                  <SettingsRow
                     key={value}
                     title={modeLabel(value, t)}
                     onPress={() => setMode(value as CycleMode)}
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
             <Text className="text-xl font-bold text-text-primary">{t('mobileComponents.wellness.onboarding.dates')}</Text>
            {mode === 'pregnant' ? (
              <View className="gap-4">
                <Text className="text-text-secondary text-sm">
                   {t('mobileComponents.wellness.onboarding.lmpHelp')}
                </Text>
                <SettingsRowGroup>
                  <SettingsRow
                     title={t('mobileComponents.wellness.onboarding.lmpStart')}
                    subtitle={lastPeriodStart}
                    onPress={() => calendarSheetRef.current?.present()}
                  />
                </SettingsRowGroup>
              </View>
            ) : mode === 'postpartum' || mode === 'menopause' ? (
              <View className="bg-surface rounded-xl p-4 shadow-sm border border-border-subtle">
                 <Text className="text-text-primary text-base font-semibold mb-2">{t('mobileComponents.wellness.onboarding.noConfig')}</Text>
                <Text className="text-text-secondary text-sm">
                   {t('mobileComponents.wellness.onboarding.noConfigBody')}
                </Text>
              </View>
            ) : (
              <View className="gap-4">
                <Text className="text-text-secondary text-sm">
                   {t('mobileComponents.wellness.onboarding.predictionHelp')}
                </Text>
                <SettingsRowGroup>
                  <SettingsRow
                     title={t('mobileComponents.wellness.onboarding.startDate')}
                    subtitle={lastPeriodStart}
                    onPress={() => calendarSheetRef.current?.present()}
                  />
                  <SettingsRow
                     title={t('mobileComponents.wellness.onboarding.avgCycle')}
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
                     title={t('mobileComponents.wellness.onboarding.avgPeriod')}
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
             <Text className="text-xl font-bold text-text-primary">{t('mobileComponents.wellness.onboarding.profile')}</Text>
            <Text className="text-text-secondary text-sm">
               {t('mobileComponents.wellness.onboarding.profileBody')}
            </Text>
            <SettingsRowGroup>
              <SettingsRow
                 title={t('mobileComponents.wellness.onboarding.birthControl')}
                rightAccessory={
                  <BottomSheetPicker
                    value={birthControl}
                    options={BC_OPTIONS}
                    onSelect={setBirthControl}
                     title={t('mobileComponents.wellness.onboarding.selectMethod')}
                    containerStyle={{ flex: 1, maxWidth: 200 }}
                  />
                }
              />
            </SettingsRowGroup>

             <Text className="text-base font-semibold text-text-primary mt-4 mb-2">{t('mobileComponents.wellness.onboarding.conditions')}</Text>
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
             <Text className="text-xl font-bold text-text-primary">{t('mobileComponents.wellness.onboarding.disclaimer')}</Text>
            <View className="bg-surface border border-border-subtle rounded-xl p-4 shadow-sm">
              <View className="flex-row items-center gap-2 mb-2">
                <Icon name="warning" size={18} color="#D97706" />
                 <Text className="text-text-primary font-bold">{t('mobileComponents.wellness.onboarding.medical')}</Text>
              </View>
              <Text className="text-text-secondary text-sm leading-5">
                 {t('mobileComponents.wellness.onboarding.medicalBody')}
              </Text>
            </View>

            {loading ? (
              <ActivityIndicator size="large" color={accentColor} className="mt-4" />
            ) : (
              <Button variant="primary" className="mt-4" onPress={handleComplete}>
                 {t('mobileComponents.wellness.onboarding.accept')}
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
             {t('mobileComponents.wellness.onboarding.next')}
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
