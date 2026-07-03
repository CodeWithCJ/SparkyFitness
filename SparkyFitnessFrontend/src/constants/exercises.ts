import { format } from 'date-fns';
import {
  Activity,
  Dumbbell,
  HeartPulse,
  Flower2,
  ArrowBigUp,
  Zap,
  Hammer,
  ChevronsUp,
  Expand,
  Pause,
} from 'lucide-react';
export const EXERCISE_CATEGORIES = [
  {
    value: 'general',
    labelKey: 'exercise.addExerciseDialog.categoryGeneral',
    defaultLabel: 'General',
  },
  {
    value: 'strength',
    labelKey: 'exercise.addExerciseDialog.categoryStrength',
    defaultLabel: 'Strength',
  },
  {
    value: 'cardio',
    labelKey: 'exercise.addExerciseDialog.categoryCardio',
    defaultLabel: 'Cardio',
  },
  {
    value: 'yoga',
    labelKey: 'exercise.addExerciseDialog.categoryYoga',
    defaultLabel: 'Yoga',
  },
  {
    value: 'powerlifting',
    labelKey: 'exercise.databaseManager.categoryPowerlifting',
    defaultLabel: 'Powerlifting',
  },
  {
    value: 'olympic weightlifting',
    labelKey: 'exercise.databaseManager.categoryOlympicWeightlifting',
    defaultLabel: 'Olympic Weightlifting',
  },
  {
    value: 'strongman',
    labelKey: 'exercise.databaseManager.categoryStrongman',
    defaultLabel: 'Strongman',
  },
  {
    value: 'plyometrics',
    labelKey: 'exercise.databaseManager.categoryPlyometrics',
    defaultLabel: 'Plyometrics',
  },
  {
    value: 'stretching',
    labelKey: 'exercise.databaseManager.categoryStretching',
    defaultLabel: 'Stretching',
  },
  {
    value: 'isometric',
    labelKey: 'exercise.databaseManager.categoryIsometric',
    defaultLabel: 'Isometric',
  },
] as const;

export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number]['value'];

export const EXERCISE_CATEGORY_META: Record<
  ExerciseCategory,
  { icon: React.ElementType; color: string; bg: string }
> = {
  general: {
    icon: Activity,
    color: 'text-slate-500',
    bg: 'bg-slate-100 dark:bg-slate-800',
  },
  strength: {
    icon: Dumbbell,
    color: 'text-blue-600',
    bg: 'bg-blue-100 dark:bg-blue-900/40',
  },
  cardio: {
    icon: HeartPulse,
    color: 'text-rose-500',
    bg: 'bg-rose-100 dark:bg-rose-900/40',
  },
  yoga: {
    icon: Flower2,
    color: 'text-emerald-500',
    bg: 'bg-emerald-100 dark:bg-emerald-900/40',
  },
  powerlifting: {
    icon: ArrowBigUp,
    color: 'text-orange-600',
    bg: 'bg-orange-100 dark:bg-orange-900/40',
  },
  'olympic weightlifting': {
    icon: Zap,
    color: 'text-yellow-500',
    bg: 'bg-yellow-100 dark:bg-yellow-900/40',
  },
  strongman: {
    icon: Hammer,
    color: 'text-red-600',
    bg: 'bg-red-100 dark:bg-red-900/40',
  },
  plyometrics: {
    icon: ChevronsUp,
    color: 'text-violet-500',
    bg: 'bg-violet-100 dark:bg-violet-900/40',
  },
  stretching: {
    icon: Expand,
    color: 'text-teal-500',
    bg: 'bg-teal-100 dark:bg-teal-900/40',
  },
  isometric: {
    icon: Pause,
    color: 'text-indigo-500',
    bg: 'bg-indigo-100 dark:bg-indigo-900/40',
  },
};
export const DAYS_OF_WEEK = [
  { id: 0, name: 'Sunday' },
  { id: 1, name: 'Monday' },
  { id: 2, name: 'Tuesday' },
  { id: 3, name: 'Wednesday' },
  { id: 4, name: 'Thursday' },
  { id: 5, name: 'Friday' },
  { id: 6, name: 'Saturday' },
];

export const DATE_FORMATS = [
  { value: 'MM/dd/yyyy', label: 'MM/dd/yyyy (e.g., 12/25/2024)' },
  { value: 'dd/MM/yyyy', label: 'dd/MM/yyyy (e.g., 25/12/2024)' },
  { value: 'dd-MMM-yyyy', label: 'dd-MMM-yyyy (e.g., 25-Dec-2024)' },
  { value: 'yyyy-MM-dd', label: 'yyyy-MM-dd (e.g., 2024-12-25)' },
  { value: 'MMM dd, yyyy', label: 'MMM dd, yyyy (e.g., Dec 25, 2024)' },
];

export const CSV_DUMMY_DATA = [
  {
    entry_date: format(new Date(), 'MM/dd/yyyy'),
    exercise_name: 'Barbell Bench Press',
    preset_name: 'Upper Body Strength',
    entry_notes: 'Feeling strong today',
    calories_burned: '300',
    distance: '',
    avg_heart_rate: '',
    set_number: '1',
    set_type: 'Working Set',
    reps: '10',
    weight: '60.0',
    duration_min: '1',
    rest_time_sec: '90',
    set_notes: 'Controlled movement',
    exercise_category: 'strength',
    calories_per_hour: '400',
    exercise_description:
      'A compound exercise for chest, shoulders, and triceps.',
    exercise_source: 'CSV_Import',
    exercise_force: 'push',
    exercise_level: 'intermediate',
    exercise_mechanic: 'compound',
    exercise_equipment: 'barbell,bench',
    primary_muscles: 'chest,triceps',
    secondary_muscles: 'shoulders',
    instructions: 'Lie on bench.\nUnrack bar.\nLower to chest.\nPress up.',
    activity_field_name: 'Mood',
    activity_value: 'Energized',
  },
  {
    entry_date: format(new Date(), 'MM/dd/yyyy'),
    exercise_name: 'Barbell Bench Press',
    preset_name: 'Upper Body Strength',
    entry_notes: '',
    calories_burned: '',
    distance: '',
    avg_heart_rate: '',
    set_number: '2',
    set_type: 'Working Set',
    reps: '8',
    weight: '70.0',
    duration_min: '1',
    rest_time_sec: '120',
    set_notes: 'Push harder',
    exercise_category: '',
    calories_per_hour: '',
    exercise_description: '',
    exercise_source: '',
    exercise_force: '',
    exercise_level: '',
    exercise_mechanic: '',
    exercise_equipment: '',
    primary_muscles: '',
    secondary_muscles: '',
    instructions: '',
    activity_field_name: 'RPE',
    activity_value: '8',
  },
  {
    entry_date: format(new Date(), 'MM/dd/yyyy'),
    exercise_name: 'Outdoor Run',
    preset_name: '',
    entry_notes: 'Enjoyed the fresh air',
    calories_burned: '250',
    distance: '5.0',
    avg_heart_rate: '160',
    set_number: '',
    set_type: '',
    reps: '',
    weight: '',
    duration_min: '30',
    rest_time_sec: '',
    set_notes: '',
    exercise_category: 'cardio',
    calories_per_hour: '350',
    exercise_description: 'Running outdoors for cardiovascular fitness.',
    exercise_source: 'CSV_Import',
    exercise_force: '',
    exercise_level: 'beginner',
    exercise_mechanic: '',
    exercise_equipment: '',
    primary_muscles: 'quadriceps,hamstrings,calves',
    secondary_muscles: '',
    instructions: 'Run at a steady pace.',
    activity_field_name: 'Route',
    activity_value: 'Park Loop',
  },
];

export const requiredHeaders = [
  'name',
  'category',
  'calories_per_hour',
  'description',
  'force',
  'level',
  'mechanic',
  'equipment',
  'primary_muscles',
  'secondary_muscles',
  'instructions',
  'images',
  'is_custom',
  'shared_with_public',
];

export const textFields = new Set(['name', 'category', 'description']);
export const booleanFields = new Set(['is_custom', 'shared_with_public']);
export const arrayFields = new Set([
  'equipment',
  'primary_muscles',
  'secondary_muscles',
  'instructions',
  'images',
]);

// instead of using input for Level, Force & Mechanic, use dropdowns with predefined options for better data consistency
export const dropdownFields = new Set(['force', 'level', 'mechanic']);
export const dropdownOptions: Record<string, string[]> = {
  level: ['beginner', 'intermediate', 'expert'],
  force: ['pull', 'push', 'static'],
  mechanic: ['isolation', 'compound'],
};

export const DROPDOWN_GUIDES = [
  {
    key: 'levelLabel',
    label: 'Level:',
    options: dropdownOptions['level'],
  },
  { key: 'forceLabel', label: 'Force:', options: dropdownOptions['force'] },
  {
    key: 'mechanicLabel',
    label: 'Mechanic:',
    options: dropdownOptions['mechanic'],
  },
];

export const SET_TYPE_STYLES: Record<string, string> = {
  Normal: 'bg-muted text-muted-foreground',
  'Working Set': 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'Warm-up': 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'Drop Set': 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  Failure: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  AMRAP: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  'Back-off': 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  'Rest-Pause':
    'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  Cluster:
    'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  Technique: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  Isometric:
    'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
};
