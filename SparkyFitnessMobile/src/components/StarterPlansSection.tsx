import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Toast from 'react-native-toast-message';
import type { StarterWorkoutPlanKey } from '@workspace/shared';
import Button from './ui/Button';
import { useAddStarterWorkoutPlan, useStarterWorkoutPlans } from '../hooks';
import { getTodayDate } from '../utils/dateUtils';

interface StarterPlanText {
  name: string;
  description: string;
  sessions: Record<string, string>;
}

/** Translated names for the built-in plans, keyed like the server's list. */
function starterPlanText(
  t: TFunction,
  key: StarterWorkoutPlanKey
): StarterPlanText {
  switch (key) {
    case 'full_body':
      return {
        name: t('workoutPlans.starter.fullBody', { defaultValue: 'Full Body' }),
        description: t('workoutPlans.starter.fullBodyDescription', {
          defaultValue:
            'Two whole-body workouts, A and B, alternating. Good for 2 to 3 days a week.',
        }),
        sessions: {
          a: t('workoutPlans.starter.fullBodyA', {
            defaultValue: 'Full Body A',
          }),
          b: t('workoutPlans.starter.fullBodyB', {
            defaultValue: 'Full Body B',
          }),
        },
      };
    case 'upper_lower':
      return {
        name: t('workoutPlans.starter.upperLower', {
          defaultValue: 'Upper / Lower',
        }),
        description: t('workoutPlans.starter.upperLowerDescription', {
          defaultValue:
            'Four workouts rotating upper and lower body. Good for 4 days a week.',
        }),
        sessions: {
          upper_a: t('workoutPlans.starter.upperA', {
            defaultValue: 'Upper A',
          }),
          lower_a: t('workoutPlans.starter.lowerA', {
            defaultValue: 'Lower A',
          }),
          upper_b: t('workoutPlans.starter.upperB', {
            defaultValue: 'Upper B',
          }),
          lower_b: t('workoutPlans.starter.lowerB', {
            defaultValue: 'Lower B',
          }),
        },
      };
    case 'push_pull_legs':
      return {
        name: t('workoutPlans.starter.pushPullLegs', {
          defaultValue: 'Push / Pull / Legs',
        }),
        description: t('workoutPlans.starter.pushPullLegsDescription', {
          defaultValue:
            'Pushing, pulling and leg workouts in turn. Run it 3 or 6 days a week.',
        }),
        sessions: {
          push: t('workoutPlans.starter.push', { defaultValue: 'Push' }),
          pull: t('workoutPlans.starter.pull', { defaultValue: 'Pull' }),
          legs: t('workoutPlans.starter.legs', { defaultValue: 'Legs' }),
        },
      };
    case 'five_by_five':
      return {
        name: t('workoutPlans.starter.fiveByFive', { defaultValue: '5×5' }),
        description: t('workoutPlans.starter.fiveByFiveDescription', {
          defaultValue:
            'Three big barbell lifts per workout, 5 sets of 5, adding weight each time you complete them.',
        }),
        sessions: {
          a: t('workoutPlans.starter.fiveByFiveA', { defaultValue: '5×5 A' }),
          b: t('workoutPlans.starter.fiveByFiveB', { defaultValue: '5×5 B' }),
        },
      };
  }
}

/**
 * Built-in plans that copy into editable presets plus a rotation plan.
 * Hidden on servers that don't offer them.
 */
function StarterPlansSection({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const { starterPlans } = useStarterWorkoutPlans({ enabled });
  const { addStarterPlanAsync, pendingKey } = useAddStarterWorkoutPlan();
  if (starterPlans.length === 0) return null;

  const add = async (key: StarterWorkoutPlanKey, text: StarterPlanText) => {
    try {
      await addStarterPlanAsync({
        key,
        body: {
          plan_name: text.name,
          session_names: text.sessions,
          currentClientDate: getTodayDate(),
        },
      });
      Toast.show({
        type: 'success',
        text1: t('workoutPlans.starter.added', {
          defaultValue: 'Starter plan added. Its workouts are in your presets.',
        }),
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: t('workoutPlans.starter.addFailed', {
          defaultValue: 'Could not add the starter plan.',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    }
  };

  return (
    <View className="mt-6 gap-3">
      <View>
        <Text className="text-base font-semibold text-text-primary">
          {t('workoutPlans.starter.title', { defaultValue: 'Starter plans' })}
        </Text>
        <Text className="text-xs text-text-secondary mt-1">
          {t('workoutPlans.starter.subtitle', {
            defaultValue:
              'Add a ready-made plan as editable presets. It runs as a rotation: the next workout is the next one you have not done, whatever day it is.',
          })}
        </Text>
      </View>
      {starterPlans.map((plan) => {
        const text = starterPlanText(t, plan.key);
        return (
          <View
            key={plan.key}
            className="rounded-xl bg-surface border border-border-subtle p-3 gap-1.5"
          >
            <Text className="text-sm font-semibold text-text-primary">
              {text.name}
            </Text>
            <Text className="text-xs text-text-secondary">
              {text.description}
            </Text>
            <Text className="text-xs text-text-muted">
              {plan.session_keys
                .map((key) => text.sessions[key] ?? key)
                .join(' → ')}
            </Text>
            <Button
              variant="secondary"
              disabled={pendingKey != null}
              onPress={() => void add(plan.key, text)}
            >
              {pendingKey === plan.key
                ? t('workoutPlans.starter.adding', { defaultValue: 'Adding…' })
                : t('workoutPlans.starter.add', { defaultValue: 'Add plan' })}
            </Button>
          </View>
        );
      })}
    </View>
  );
}

export default StarterPlansSection;
