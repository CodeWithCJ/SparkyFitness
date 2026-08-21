import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import { getTodayDate, addDays } from '../utils/dateUtils';

import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { useCycleSettings } from '../hooks/useCycleSettings';
import {
  usePregnancyMutations,
  useCurrentPregnancy,
} from '../hooks/usePregnancy';
import { bulkPutLogs } from '../services/api/cycleApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { addLog } from '../services/LogService';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import StepperInput, { useStepperDraft } from '../components/StepperInput';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import PregnancyDueDateForm, {
  usePregnancyDueDateForm,
} from '../components/wellness/pregnancy/PregnancyDueDateForm';
import Switch from '../components/ui/Switch';
import { CYCLE_SETTING_LIMITS } from '../utils/cycleDisplayUtils';

import {
  BIRTH_CONTROL_METHODS,
  CYCLE_CONDITIONS,
  type CycleMode,
} from '@workspace/shared';

type CycleOnboardingScreenProps = RootStackScreenProps<'CycleOnboarding'>;

const MODE_OPTIONS = [
  { value: 'standard', key: 'standard' },
  { value: 'ttc', key: 'ttc' },
  { value: 'pregnant', key: 'pregnant' },
  { value: 'postpartum', key: 'postpartum' },
  { value: 'menopause', key: 'menopause' },
] as const;

const BC_OPTIONS = BIRTH_CONTROL_METHODS.map(m => ({
  value: m.value,
  label: m.displayName,
}));

const CycleOnboardingScreen: React.FC<CycleOnboardingScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const getModeLabel = (key: (typeof MODE_OPTIONS)[number]['key']): string => {
    switch (key) {
      case 'standard':
        return t('cycleOnboarding.mode.standard', {
          defaultValue: 'Standard Menstrual Cycle',
        });
      case 'ttc':
        return t('cycleOnboarding.mode.ttc', {
          defaultValue: 'Trying to Conceive (TTC)',
        });
      case 'pregnant':
        return t('cycleOnboarding.mode.pregnant', {
          defaultValue: 'Pregnancy Tracking',
        });
      case 'postpartum':
        return t('cycleOnboarding.mode.postpartum', {
          defaultValue: 'Postpartum / Recovery',
        });
      case 'menopause':
        return t('cycleOnboarding.mode.menopause', {
          defaultValue: 'Menopause Transition',
        });
    }
  };
  const getBirthControlLabel = (value: string, fallback: string): string => {
    switch (value) {
      case 'none':
        return t('cycleOnboarding.birthControl.none', { defaultValue: 'None' });
      case 'pill':
        return t('cycleOnboarding.birthControl.pill', { defaultValue: 'Pill' });
      case 'iud_hormonal':
        return t('cycleOnboarding.birthControl.iudHormonal', {
          defaultValue: 'Hormonal IUD',
        });
      case 'iud_copper':
        return t('cycleOnboarding.birthControl.iudCopper', {
          defaultValue: 'Copper IUD',
        });
      case 'implant':
        return t('cycleOnboarding.birthControl.implant', {
          defaultValue: 'Implant',
        });
      case 'ring':
        return t('cycleOnboarding.birthControl.ring', { defaultValue: 'Ring' });
      case 'patch':
        return t('cycleOnboarding.birthControl.patch', {
          defaultValue: 'Patch',
        });
      case 'shot':
        return t('cycleOnboarding.birthControl.shot', { defaultValue: 'Shot' });
      case 'condoms':
        return t('cycleOnboarding.birthControl.condoms', {
          defaultValue: 'Condoms / barrier',
        });
      case 'other':
        return t('cycleOnboarding.birthControl.other', {
          defaultValue: 'Other',
        });
      default:
        return fallback;
    }
  };
  const getConditionLabel = (value: string, fallback: string): string => {
    switch (value) {
      case 'pcos':
        return t('cycleOnboarding.condition.pcos', { defaultValue: 'PCOS' });
      case 'endometriosis':
        return t('cycleOnboarding.condition.endometriosis', {
          defaultValue: 'Endometriosis',
        });
      case 'fibroids':
        return t('cycleOnboarding.condition.fibroids', {
          defaultValue: 'Fibroids',
        });
      case 'thyroid':
        return t('cycleOnboarding.condition.thyroid', {
          defaultValue: 'Thyroid condition',
        });
      case 'other':
        return t('cycleOnboarding.condition.other', { defaultValue: 'Other' });
      default:
        return fallback;
    }
  };
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentColor, formDisabled] = useCSSVariable([
    '--color-accent-primary',
    '--color-form-disabled',
  ]) as [string, string];

  const { updateSettingsAsync } = useCycleSettings();
  const { createPregnancyAsync, updatePregnancyAsync } =
    usePregnancyMutations();
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
  const dueDateForm = usePregnancyDueDateForm();

  const cycleLengthProps = useStepperDraft({
    value: cycleLength,
    ...CYCLE_SETTING_LIMITS.cycleLength,
    onCommit: setCycleLength,
  });
  const periodLengthProps = useStepperDraft({
    value: periodLength,
    ...CYCLE_SETTING_LIMITS.periodLength,
    onCommit: setPeriodLength,
  });

  // Refs
  const calendarSheetRef = useRef<CalendarSheetRef>(null);

  const handleToggleCondition = (cond: string, val: boolean) => {
    if (val) {
      setConditions(prev => [...prev, cond]);
    } else {
      setConditions(prev => prev.filter(c => c !== cond));
    }
  };

  const handleComplete = async () => {
    if (mode === 'pregnant') {
      const dateError = dueDateForm.validate();
      if (dateError) {
        Toast.show({
          type: 'error',
          text1: t('cycleOnboarding.checkDates', {
            defaultValue: 'Check the dates',
          }),
          text2: dateError,
        });
        setStep(2);
        return;
      }
    }
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
        try {
          await createPregnancyAsync({
            ...dueDateForm.dates,
            fetus_count: 1,
            status: 'active',
            notes: null,
          });
        } catch (pregErr) {
          if (currentPregnancy?.id) {
            await updatePregnancyAsync({
              id: currentPregnancy.id,
              body: {
                ...dueDateForm.dates,
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
        text1: t('cycleOnboarding.setupComplete', {
          defaultValue: 'Setup complete!',
        }),
        text2: t('cycleOnboarding.profileInitialized', {
          defaultValue: 'Your wellness profile has been initialized.',
        }),
      });

      // Navigate to CycleHub
      navigation.replace('CycleHub');
    } catch (error) {
      addLog(`Failed to complete cycle onboarding: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('cycleOnboarding.setupFailed', {
          defaultValue: 'Setup failed',
        }),
        text2: t('cycleOnboarding.setupFailedMessage', {
          defaultValue: 'Could not complete onboarding. Please try again.',
        }),
      });
    } finally {
      setLoading(false);
    }
  };

  const header = useScreenHeader({
    title: t('cycleOnboarding.stepTitle', {
      defaultValue: 'Setup: Step {{step}} of 4',
      step,
    }),
    left:
      step > 1
        ? {
            kind: 'primary',
            label: t('common.back', { defaultValue: 'Back' }),
            onPress: () => setStep(s => s - 1),
          }
        : {
            kind: 'primary',
            label: t('common.back', { defaultValue: 'Back' }),
            onPress: () => navigation.goBack(),
          },
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
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        {step === 1 && (
          <View className="gap-4">
            <Text className="text-xl font-bold text-text-primary">
              {t('cycleOnboarding.goalTitle', {
                defaultValue: 'What is your tracking goal?',
              })}
            </Text>
            <Text className="text-text-secondary text-sm mb-2">
              {t('cycleOnboarding.goalDescription', {
                defaultValue:
                  'Select the mode that best fits your current health focus. You can change this anytime in settings.',
              })}
            </Text>
            <SettingsRowGroup>
              {MODE_OPTIONS.map(opt => {
                const isSelected = mode === opt.value;
                return (
                  <SettingsRow
                    key={opt.value}
                    title={getModeLabel(opt.key)}
                    onPress={() => setMode(opt.value as CycleMode)}
                    rightAccessory={
                      <Icon
                        name={
                          isSelected ? 'radio-button-on' : 'radio-button-off'
                        }
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
            <Text className="text-xl font-bold text-text-primary">
              {t('cycleOnboarding.datesTitle', {
                defaultValue: 'Dates & Averages',
              })}
            </Text>
            {mode === 'pregnant' ? (
              <View className="gap-4">
                <Text className="text-text-secondary text-sm">
                  {t('cycleOnboarding.dueDateDescription', {
                    defaultValue:
                      'Tell us how to estimate your due date. You can change this later in settings.',
                  })}
                </Text>
                <PregnancyDueDateForm form={dueDateForm} />
              </View>
            ) : mode === 'postpartum' || mode === 'menopause' ? (
              <View className="bg-surface rounded-xl p-4 shadow-sm border border-border-subtle">
                <Text className="text-text-primary text-base font-semibold mb-2">
                  {t('cycleOnboarding.noConfiguration', {
                    defaultValue: 'No configuration needed',
                  })}
                </Text>
                <Text className="text-text-secondary text-sm">
                  {t('cycleOnboarding.recoveryDescription', {
                    defaultValue:
                      "We will tailor your insights to hormonal recovery or menopause transition symptoms. Let's move on to the next step.",
                  })}
                </Text>
              </View>
            ) : (
              <View className="gap-4">
                <Text className="text-text-secondary text-sm">
                  {t('cycleOnboarding.predictionsDescription', {
                    defaultValue: 'Help us build predictions for your cycle.',
                  })}
                </Text>
                <SettingsRowGroup>
                  <SettingsRow
                    title={t('cycleOnboarding.lastPeriodStart', {
                      defaultValue: 'Last Period Start Date',
                    })}
                    subtitle={lastPeriodStart}
                    onPress={() => calendarSheetRef.current?.present()}
                  />
                  <SettingsRow
                    title={t('cycleOnboarding.averageCycleLength', {
                      defaultValue: 'Average Cycle Length',
                    })}
                    rightAccessory={
                      <StepperInput
                        {...cycleLengthProps}
                        keyboardType="number-pad"
                      />
                    }
                  />
                  <SettingsRow
                    title={t('cycleOnboarding.averagePeriodLength', {
                      defaultValue: 'Average Period Length',
                    })}
                    rightAccessory={
                      <StepperInput
                        {...periodLengthProps}
                        keyboardType="number-pad"
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
            <Text className="text-xl font-bold text-text-primary">
              {t('cycleOnboarding.profileTitle', {
                defaultValue: 'Profile & Conditions',
              })}
            </Text>
            <Text className="text-text-secondary text-sm">
              {t('cycleOnboarding.profileDescription', {
                defaultValue:
                  'Select any relevant conditions or birth control methods to personalize your tracking.',
              })}
            </Text>
            <SettingsRowGroup>
              <SettingsRow
                title={t('cycleOnboarding.birthControlMethod', {
                  defaultValue: 'Birth Control Method',
                })}
                rightAccessory={
                  <BottomSheetPicker
                    value={birthControl}
                    options={BC_OPTIONS.map(option => ({
                      ...option,
                      label: getBirthControlLabel(option.value, option.label),
                    }))}
                    onSelect={setBirthControl}
                    title={t('cycleOnboarding.selectMethod', {
                      defaultValue: 'Select Method',
                    })}
                    containerStyle={{ flex: 1, maxWidth: 200 }}
                  />
                }
              />
            </SettingsRowGroup>

            <Text className="text-base font-semibold text-text-primary mt-4 mb-2">
              {t('cycleOnboarding.conditions', { defaultValue: 'Conditions' })}
            </Text>
            <SettingsRowGroup>
              {CYCLE_CONDITIONS.map(cond => (
                <SettingsRow
                  key={cond.value}
                  title={getConditionLabel(cond.value, cond.displayName)}
                  rightAccessory={
                    <Switch
                      value={conditions.includes(cond.value)}
                      onValueChange={val =>
                        handleToggleCondition(cond.value, val)
                      }
                    />
                  }
                />
              ))}
            </SettingsRowGroup>
          </View>
        )}

        {step === 4 && (
          <View className="gap-4">
            <Text className="text-xl font-bold text-text-primary">
              {t('cycleOnboarding.disclaimerTitle', {
                defaultValue: 'Disclaimer & Complete',
              })}
            </Text>
            <View className="bg-surface border border-border-subtle rounded-xl p-4 shadow-sm">
              <View className="flex-row items-center gap-2 mb-2">
                <Icon name="warning" size={18} color="#D97706" />
                <Text className="text-text-primary font-bold">
                  {t('cycleOnboarding.medicalDisclaimer', {
                    defaultValue: 'Medical Disclaimer',
                  })}
                </Text>
              </View>
              <Text className="text-text-secondary text-sm leading-5">
                {t('cycleOnboarding.disclaimerBody', {
                  defaultValue:
                    'The SparkyFitness Wellness and Reproductive Health Tracker is designed to help you track predictions, symptoms, and physiological parameters. It is NOT intended to be used as a contraceptive method or as a diagnostic/treatment tool.',
                })}
                {'\n\n'}
                {t('cycleOnboarding.consultProfessional', {
                  defaultValue:
                    'Always consult with a qualified medical professional for health concerns.',
                })}
              </Text>
            </View>

            {loading ? (
              <ActivityIndicator
                size="large"
                color={accentColor}
                className="mt-4"
              />
            ) : (
              <Button
                variant="primary"
                className="mt-4"
                onPress={handleComplete}
              >
                {t('cycleOnboarding.acceptInitialize', {
                  defaultValue: 'Accept & Initialize Profile',
                })}
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
          <Button variant="primary" onPress={() => setStep(s => s + 1)}>
            {t('common.next', { defaultValue: "Next" })}
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
