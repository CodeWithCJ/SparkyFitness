import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Repeat } from 'lucide-react';
import type { StarterWorkoutPlanKey } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateToYYYYMMDD } from '@/lib/utils';
import { useCreateStarterWorkoutPlanMutation } from '@/hooks/Exercises/useWorkoutPlans';

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
        name: t('workoutPlansManager.starterPlans.fullBody', 'Full Body'),
        description: t(
          'workoutPlansManager.starterPlans.fullBodyDescription',
          'Two whole-body workouts, A and B, alternating. Good for 2 to 3 days a week.'
        ),
        sessions: {
          a: t('workoutPlansManager.starterPlans.fullBodyA', 'Full Body A'),
          b: t('workoutPlansManager.starterPlans.fullBodyB', 'Full Body B'),
        },
      };
    case 'upper_lower':
      return {
        name: t('workoutPlansManager.starterPlans.upperLower', 'Upper / Lower'),
        description: t(
          'workoutPlansManager.starterPlans.upperLowerDescription',
          'Four workouts rotating upper and lower body. Good for 4 days a week.'
        ),
        sessions: {
          upper_a: t('workoutPlansManager.starterPlans.upperA', 'Upper A'),
          lower_a: t('workoutPlansManager.starterPlans.lowerA', 'Lower A'),
          upper_b: t('workoutPlansManager.starterPlans.upperB', 'Upper B'),
          lower_b: t('workoutPlansManager.starterPlans.lowerB', 'Lower B'),
        },
      };
    case 'push_pull_legs':
      return {
        name: t(
          'workoutPlansManager.starterPlans.pushPullLegs',
          'Push / Pull / Legs'
        ),
        description: t(
          'workoutPlansManager.starterPlans.pushPullLegsDescription',
          'Pushing, pulling and leg workouts in turn. Run it 3 or 6 days a week.'
        ),
        sessions: {
          push: t('workoutPlansManager.starterPlans.push', 'Push'),
          pull: t('workoutPlansManager.starterPlans.pull', 'Pull'),
          legs: t('workoutPlansManager.starterPlans.legs', 'Legs'),
        },
      };
    case 'five_by_five':
      return {
        name: t('workoutPlansManager.starterPlans.fiveByFive', '5×5'),
        description: t(
          'workoutPlansManager.starterPlans.fiveByFiveDescription',
          'Three big barbell lifts per workout, 5 sets of 5, adding weight each time you complete them.'
        ),
        sessions: {
          a: t('workoutPlansManager.starterPlans.fiveByFiveA', '5×5 A'),
          b: t('workoutPlansManager.starterPlans.fiveByFiveB', '5×5 B'),
        },
      };
  }
}

const STARTER_PLAN_KEYS: StarterWorkoutPlanKey[] = [
  'full_body',
  'upper_lower',
  'push_pull_legs',
  'five_by_five',
];

/**
 * Built-in plans that copy into ordinary presets plus a rotation plan, so the
 * next workout is always the next one not done yet.
 */
const StarterPlansCard = () => {
  const { t } = useTranslation();
  const { mutate, isPending, variables } =
    useCreateStarterWorkoutPlanMutation();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">
          {t('workoutPlansManager.starterPlans.title', 'Starter plans')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            'workoutPlansManager.starterPlans.subtitle',
            'Add a ready-made plan as editable presets. It runs as a rotation: the next workout is the next one you have not done, whatever day it is.'
          )}
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {STARTER_PLAN_KEYS.map((key) => {
          const text = starterPlanText(t, key);
          const adding = isPending && variables?.key === key;
          return (
            <div
              key={key}
              className="rounded-lg border p-3 flex flex-col gap-2"
            >
              <div className="font-medium flex items-center gap-2">
                <Repeat className="h-4 w-4 text-primary" />
                {text.name}
              </div>
              <p className="text-xs text-muted-foreground flex-1">
                {text.description}
              </p>
              <p className="text-xs text-muted-foreground">
                {Object.values(text.sessions).join(' → ')}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  mutate({
                    key,
                    body: {
                      plan_name: text.name,
                      session_names: text.sessions,
                      currentClientDate: formatDateToYYYYMMDD(new Date()),
                    },
                  })
                }
              >
                {adding
                  ? t('workoutPlansManager.starterPlans.adding', 'Adding…')
                  : t('workoutPlansManager.starterPlans.add', 'Add plan')}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default StarterPlansCard;
