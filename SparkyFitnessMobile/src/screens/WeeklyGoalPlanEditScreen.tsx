import React, { useCallback, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import FormInput from '../components/FormInput';
import FormScreenChrome from '../components/FormScreenChrome';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import Switch from '../components/ui/Switch';
import {
  useGoalPresets,
  useWeeklyGoalPlanMutations,
  useWeeklyGoalPlans,
} from '../hooks/useGoals';
import {
  WEEKDAY_KEYS,
  type GoalPreset,
  type WeekdayKey,
  type WeeklyGoalPlan,
} from '../types/goals';
import type { RootStackScreenProps } from '../types/navigation';
import { formatDate, getTodayDate, normalizeDate } from '../utils/dateUtils';

type WeeklyGoalPlanEditScreenProps = RootStackScreenProps<'WeeklyGoalPlanEdit'>;

const NO_PRESET = '';

const emptyPlan = (): WeeklyGoalPlan => ({
  plan_name: '',
  start_date: getTodayDate(),
  end_date: null,
  is_active: true,
  monday_preset_id: null,
  tuesday_preset_id: null,
  wednesday_preset_id: null,
  thursday_preset_id: null,
  friday_preset_id: null,
  saturday_preset_id: null,
  sunday_preset_id: null,
});

interface DateRowProps {
  label: string;
  value: string | null;
  locale: string;
  onPress: () => void;
  onClear?: () => void;
}

const DateRow: React.FC<DateRowProps> = ({
  label,
  value,
  locale,
  onPress,
  onClear,
}) => {
  const { t } = useTranslation();
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-text-primary">{label}</Text>
      <View className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label}
          className="flex-1 flex-row items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11"
        >
          <Text className="text-base text-text-primary">
            {value
              ? formatDate(value, locale)
              : t('goals.weekly.noEndDate', { defaultValue: 'No end date' })}
          </Text>
          <Icon name="calendar" size={16} color={textMuted} />
        </TouchableOpacity>
        {value && onClear && (
          <TouchableOpacity
            onPress={onClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('goals.weekly.clearEndDate', {
              defaultValue: 'Clear end date',
            })}
          >
            <Icon name="close" size={20} color={textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

interface PlanFormProps {
  plan: WeeklyGoalPlan;
  presets: GoalPreset[];
  onDone: () => void;
}

const PlanForm: React.FC<PlanFormProps> = ({ plan, presets, onDone }) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const { createPlan, updatePlan, isPending } = useWeeklyGoalPlanMutations();
  const [draft, setDraft] = useState<WeeklyGoalPlan>(plan);
  const startSheetRef = useRef<CalendarSheetRef>(null);
  const endSheetRef = useRef<CalendarSheetRef>(null);

  const openStartSheet = useCallback(
    () => startSheetRef.current?.present(),
    []
  );
  const openEndSheet = useCallback(() => endSheetRef.current?.present(), []);

  const weekdayLabels: Record<WeekdayKey, string> = {
    monday: t('goals.weekly.days.monday', { defaultValue: 'Monday' }),
    tuesday: t('goals.weekly.days.tuesday', { defaultValue: 'Tuesday' }),
    wednesday: t('goals.weekly.days.wednesday', { defaultValue: 'Wednesday' }),
    thursday: t('goals.weekly.days.thursday', { defaultValue: 'Thursday' }),
    friday: t('goals.weekly.days.friday', { defaultValue: 'Friday' }),
    saturday: t('goals.weekly.days.saturday', { defaultValue: 'Saturday' }),
    sunday: t('goals.weekly.days.sunday', { defaultValue: 'Sunday' }),
  };

  const presetOptions = [
    {
      label: t('goals.weekly.noPreset', { defaultValue: 'No preset' }),
      value: NO_PRESET,
    },
    ...presets
      .filter((preset) => preset.id)
      .map((preset) => ({
        label: preset.preset_name,
        value: preset.id as string,
      })),
  ];

  const handleSave = useCallback(async () => {
    const error = !draft.plan_name.trim()
      ? t('goals.weekly.nameRequired', {
          defaultValue: 'Give the plan a name.',
        })
      : draft.end_date && draft.end_date < draft.start_date
        ? t('goals.weekly.endBeforeStart', {
            defaultValue: 'The end date cannot be before the start date.',
          })
        : null;
    if (error) {
      Toast.show({ type: 'error', text1: error });
      return;
    }
    const body: WeeklyGoalPlan = {
      ...draft,
      plan_name: draft.plan_name.trim(),
    };
    try {
      if (draft.id) await updatePlan({ id: draft.id, plan: body });
      else await createPlan(body);
      onDone();
    } catch {
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('goals.weekly.saveFailed', {
          defaultValue: 'Failed to save the weekly plan.',
        }),
      });
    }
  }, [createPlan, draft, onDone, t, updatePlan]);

  return (
    <FormScreenChrome
      title={
        draft.id
          ? t('goals.weekly.editTitle', { defaultValue: 'Weekly plan' })
          : t('goals.weekly.newTitle', { defaultValue: 'New weekly plan' })
      }
      saveLabel={t('common.save', { defaultValue: 'Save' })}
      savingLabel={t('common.saving', { defaultValue: 'Saving…' })}
      isSaving={isPending}
      onSave={handleSave}
      onCancel={onDone}
    >
      <Text className="text-sm text-text-secondary">
        {t('goals.weekly.description', {
          defaultValue:
            'Pick a goal preset for each day of the week. Between the start and end dates, each day uses its preset instead of your regular goals. Only one plan can be active at a time.',
        })}
      </Text>
      <View className="gap-1">
        <Text className="text-sm font-medium text-text-primary">
          {t('goals.weekly.planName', { defaultValue: 'Plan name' })}
        </Text>
        <FormInput
          value={draft.plan_name}
          onChangeText={(plan_name) =>
            setDraft((prev) => ({ ...prev, plan_name }))
          }
          placeholder={t('goals.weekly.planName', {
            defaultValue: 'Plan name',
          })}
          accessibilityLabel={t('goals.weekly.planName', {
            defaultValue: 'Plan name',
          })}
          testID="weekly-plan-name"
        />
      </View>
      <DateRow
        label={t('goals.weekly.startDate', { defaultValue: 'Start date' })}
        value={draft.start_date}
        locale={dateLocale}
        onPress={openStartSheet}
      />
      <DateRow
        label={t('goals.weekly.endDate', {
          defaultValue: 'End date (optional)',
        })}
        value={draft.end_date}
        locale={dateLocale}
        onPress={openEndSheet}
        onClear={() => setDraft((prev) => ({ ...prev, end_date: null }))}
      />
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium text-text-primary">
          {t('goals.weekly.active', { defaultValue: 'Active plan' })}
        </Text>
        <Switch
          value={draft.is_active}
          onValueChange={(is_active) =>
            setDraft((prev) => ({ ...prev, is_active }))
          }
          accessibilityLabel={t('goals.weekly.active', {
            defaultValue: 'Active plan',
          })}
        />
      </View>
      {presets.length === 0 && (
        <Text className="text-sm text-text-muted">
          {t('goals.weekly.needsPresets', {
            defaultValue:
              'Create a goal preset first, then assign it to days here.',
          })}
        </Text>
      )}
      {WEEKDAY_KEYS.map((day) => {
        const key = `${day}_preset_id` as const;
        return (
          <View key={day} className="gap-1">
            <Text className="text-sm font-medium text-text-primary">
              {weekdayLabels[day]}
            </Text>
            <BottomSheetPicker
              value={draft[key] ?? NO_PRESET}
              options={presetOptions}
              onSelect={(value) =>
                setDraft((prev) => ({ ...prev, [key]: value || null }))
              }
              title={weekdayLabels[day]}
              placeholder={t('goals.weekly.noPreset', {
                defaultValue: 'No preset',
              })}
            />
          </View>
        );
      })}
      <CalendarSheet
        ref={startSheetRef}
        selectedDate={draft.start_date}
        onSelectDate={(start_date) =>
          setDraft((prev) => ({ ...prev, start_date }))
        }
      />
      <CalendarSheet
        ref={endSheetRef}
        selectedDate={draft.end_date ?? draft.start_date}
        onSelectDate={(end_date) => setDraft((prev) => ({ ...prev, end_date }))}
      />
    </FormScreenChrome>
  );
};

const WeeklyGoalPlanEditScreen: React.FC<WeeklyGoalPlanEditScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const planId = route.params?.planId;
  const { presets, isLoading: loadingPresets } = useGoalPresets();
  const { plans, isLoading: loadingPlans } = useWeeklyGoalPlans();
  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const existing = planId ? plans.find((plan) => plan.id === planId) : null;
  if (loadingPresets || loadingPlans || (planId && !existing)) {
    return (
      <StatusView
        loading={loadingPresets || loadingPlans}
        icon={loadingPresets || loadingPlans ? undefined : 'alert-circle'}
        title={
          loadingPresets || loadingPlans
            ? undefined
            : t('goals.weekly.loadFailed', {
                defaultValue: 'Could not find this weekly plan.',
              })
        }
        action={
          loadingPresets || loadingPlans
            ? undefined
            : {
                label: t('goals.weekly.goBack', { defaultValue: 'Go back' }),
                onPress: goBack,
              }
        }
      />
    );
  }

  const plan: WeeklyGoalPlan = existing
    ? {
        ...existing,
        start_date: normalizeDate(existing.start_date),
        end_date: existing.end_date ? normalizeDate(existing.end_date) : null,
      }
    : emptyPlan();

  return <PlanForm plan={plan} presets={presets} onDone={goBack} />;
};

export default WeeklyGoalPlanEditScreen;
