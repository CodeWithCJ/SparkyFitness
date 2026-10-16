import React from 'react';
import { Alert, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import Button from './ui/Button';
import { useWeeklyGoalPlanMutations } from '../hooks/useGoals';
import {
  WEEKDAY_KEYS,
  type GoalPreset,
  type WeeklyGoalPlan,
} from '../types/goals';
import { formatDate, normalizeDate } from '../utils/dateUtils';

interface WeeklyGoalPlansSectionProps {
  plans: WeeklyGoalPlan[];
  presets: GoalPreset[];
  onCreate: () => void;
  onEdit: (plan: WeeklyGoalPlan) => void;
}

const WeeklyGoalPlansSection: React.FC<WeeklyGoalPlansSectionProps> = ({
  plans,
  presets,
  onCreate,
  onEdit,
}) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const { deletePlan, isPending } = useWeeklyGoalPlanMutations();

  const confirmDelete = (plan: WeeklyGoalPlan) =>
    Alert.alert(
      t('goals.weekly.deleteTitle', { defaultValue: 'Delete weekly plan?' }),
      t('goals.weekly.deleteMessage', {
        defaultValue: 'Delete "{{name}}"?',
        name: plan.plan_name,
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => {
            if (!plan.id) return;
            try {
              await deletePlan(plan.id);
            } catch {
              Toast.show({
                type: 'error',
                text1: t('common.error', { defaultValue: 'Error' }),
                text2: t('goals.weekly.deleteFailed', {
                  defaultValue: 'Could not delete the weekly plan.',
                }),
              });
            }
          },
        },
      ]
    );

  const assignedDays = (plan: WeeklyGoalPlan) =>
    WEEKDAY_KEYS.filter((day) => {
      const id = plan[`${day}_preset_id`];
      return id && presets.some((preset) => preset.id === id);
    }).length;

  return (
    <View className="gap-3">
      <Text className="text-sm text-text-secondary">
        {t('goals.weekly.sectionDescription', {
          defaultValue:
            'Use a different goal preset on each day of the week, for example higher calories on training days.',
        })}
      </Text>
      {plans.length === 0 && (
        <Text className="text-sm text-text-muted">
          {t('goals.weekly.empty', { defaultValue: 'No weekly plans yet.' })}
        </Text>
      )}
      {plans.map((plan) => {
        const id = plan.id ?? plan.plan_name;
        return (
          <View key={id} className="gap-2 rounded-lg bg-raised p-3">
            <View className="flex-row items-center gap-2">
              <Text className="flex-shrink text-base font-semibold text-text-primary">
                {plan.plan_name}
              </Text>
              {plan.is_active && (
                <Text className="text-xs font-semibold text-accent-primary">
                  {t('goals.weekly.activeBadge', { defaultValue: 'Active' })}
                </Text>
              )}
            </View>
            <Text className="text-sm text-text-secondary">
              {plan.end_date
                ? t('goals.weekly.range', {
                    defaultValue: '{{start}} to {{end}}',
                    start: formatDate(
                      normalizeDate(plan.start_date),
                      dateLocale
                    ),
                    end: formatDate(normalizeDate(plan.end_date), dateLocale),
                  })
                : t('goals.weekly.rangeOpen', {
                    defaultValue: 'From {{start}}, no end date',
                    start: formatDate(
                      normalizeDate(plan.start_date),
                      dateLocale
                    ),
                  })}
              {' · '}
              {t('goals.weekly.daysAssigned', {
                defaultValue: '{{count}} of 7 days set',
                count: assignedDays(plan),
              })}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Button
                variant="secondary"
                onPress={() => onEdit(plan)}
                className="py-2"
                textClassName="text-xs"
                testID={`weekly-plan-edit-${id}`}
              >
                {t('goals.presets.edit', { defaultValue: 'Edit' })}
              </Button>
              <Button
                variant="destructive"
                disabled={isPending}
                onPress={() => confirmDelete(plan)}
                className="py-2"
                textClassName="text-xs"
              >
                {t('common.delete', { defaultValue: 'Delete' })}
              </Button>
            </View>
          </View>
        );
      })}
      <Button
        variant="secondary"
        onPress={onCreate}
        className="py-2"
        textClassName="text-sm"
        testID="weekly-plan-create"
      >
        {t('goals.weekly.create', { defaultValue: 'New weekly plan' })}
      </Button>
    </View>
  );
};

export default WeeklyGoalPlansSection;
