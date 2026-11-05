import type { StarterWorkoutPlanKey } from '@workspace/shared';

/**
 * Built-in starter plans. Generic, well-known layouts (full body, upper/lower,
 * push/pull/legs, linear 5x5), written for SparkyFitness and free to reuse.
 * Exercises are free-exercise-db ids, imported into the user's library on
 * first use. Weights are left empty: the first session sets the baseline and
 * progression takes over from there.
 */
export interface StarterExercise {
  /** free-exercise-db id. */
  id: string;
  sets: number;
  /** Top of the range (double) or reps per set (fixed). */
  reps: number;
  /** Bottom of the range; set means double progression. */
  repMin?: number;
  /** Kg added when progression moves on. */
  incrementKg?: number;
  restSeconds?: number;
}

export interface StarterSession {
  key: string;
  /** English fallback name. */
  name: string;
  exercises: StarterExercise[];
}

export interface StarterPlan {
  key: StarterWorkoutPlanKey;
  /** English fallback name. */
  name: string;
  sessions: StarterSession[];
}

const BENCH = 'Barbell_Bench_Press_-_Medium_Grip';
const SQUAT = 'Barbell_Full_Squat';
const DEADLIFT = 'Barbell_Deadlift';
const OHP = 'Standing_Military_Press';
const ROW = 'Bent_Over_Barbell_Row';

const heavy = (id: string, sets: number, reps: number, incrementKg = 2.5) => ({
  id,
  sets,
  reps,
  incrementKg,
  restSeconds: 180,
});
const range = (id: string, sets: number, repMin: number, reps: number) => ({
  id,
  sets,
  repMin,
  reps,
  incrementKg: 2.5,
  restSeconds: 90,
});

export const STARTER_WORKOUT_PLANS: readonly StarterPlan[] = [
  {
    key: 'full_body',
    name: 'Full Body',
    sessions: [
      {
        key: 'a',
        name: 'Full Body A',
        exercises: [
          heavy(SQUAT, 3, 5),
          heavy(BENCH, 3, 5),
          range(ROW, 3, 8, 12),
          range('Dumbbell_Lunges', 2, 8, 12),
        ],
      },
      {
        key: 'b',
        name: 'Full Body B',
        exercises: [
          heavy(DEADLIFT, 1, 5, 5),
          heavy(OHP, 3, 5),
          range('Wide-Grip_Lat_Pulldown', 3, 8, 12),
          range('Barbell_Hip_Thrust', 2, 8, 12),
        ],
      },
    ],
  },
  {
    key: 'upper_lower',
    name: 'Upper / Lower',
    sessions: [
      {
        key: 'upper_a',
        name: 'Upper A',
        exercises: [
          range(BENCH, 4, 6, 8),
          range(ROW, 4, 6, 8),
          range('Seated_Dumbbell_Press', 3, 8, 12),
          range('Wide-Grip_Lat_Pulldown', 3, 8, 12),
          range('Barbell_Curl', 2, 10, 15),
          range('Triceps_Pushdown', 2, 10, 15),
        ],
      },
      {
        key: 'lower_a',
        name: 'Lower A',
        exercises: [
          range(SQUAT, 4, 6, 8),
          range('Romanian_Deadlift', 3, 8, 10),
          range('Leg_Press', 3, 10, 15),
          range('Lying_Leg_Curls', 3, 10, 15),
          range('Standing_Calf_Raises', 3, 10, 15),
        ],
      },
      {
        key: 'upper_b',
        name: 'Upper B',
        exercises: [
          range('Incline_Dumbbell_Press', 4, 8, 10),
          range('Seated_Cable_Rows', 4, 8, 12),
          range('Chin-Up', 3, 6, 10),
          range('Side_Lateral_Raise', 3, 12, 15),
          range('Hammer_Curls', 2, 10, 15),
          range('Lying_Triceps_Press', 2, 10, 12),
        ],
      },
      {
        key: 'lower_b',
        name: 'Lower B',
        exercises: [
          range(DEADLIFT, 3, 4, 6),
          range('Front_Barbell_Squat', 3, 6, 8),
          range('Barbell_Hip_Thrust', 3, 8, 12),
          range('Leg_Extensions', 3, 12, 15),
          range('Standing_Calf_Raises', 3, 12, 15),
        ],
      },
    ],
  },
  {
    key: 'push_pull_legs',
    name: 'Push / Pull / Legs',
    sessions: [
      {
        key: 'push',
        name: 'Push',
        exercises: [
          range(BENCH, 4, 6, 8),
          range('Seated_Dumbbell_Press', 3, 8, 10),
          range('Incline_Dumbbell_Press', 3, 8, 12),
          range('Side_Lateral_Raise', 3, 12, 15),
          range('Triceps_Pushdown', 3, 10, 12),
          range('Dips_-_Triceps_Version', 2, 8, 12),
        ],
      },
      {
        key: 'pull',
        name: 'Pull',
        exercises: [
          range(DEADLIFT, 3, 4, 6),
          range('Pullups', 3, 6, 10),
          range('Seated_Cable_Rows', 3, 8, 12),
          range('Face_Pull', 3, 12, 15),
          range('Barbell_Curl', 3, 8, 12),
          range('Hammer_Curls', 2, 10, 12),
        ],
      },
      {
        key: 'legs',
        name: 'Legs',
        exercises: [
          range(SQUAT, 4, 6, 8),
          range('Romanian_Deadlift', 3, 8, 10),
          range('Leg_Press', 3, 10, 12),
          range('Lying_Leg_Curls', 3, 10, 12),
          range('Standing_Calf_Raises', 4, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'five_by_five',
    name: '5×5',
    sessions: [
      {
        key: 'a',
        name: '5×5 A',
        exercises: [heavy(SQUAT, 5, 5), heavy(BENCH, 5, 5), heavy(ROW, 5, 5)],
      },
      {
        key: 'b',
        name: '5×5 B',
        exercises: [
          heavy(SQUAT, 5, 5),
          heavy(OHP, 5, 5),
          heavy(DEADLIFT, 1, 5, 5),
        ],
      },
    ],
  },
];
