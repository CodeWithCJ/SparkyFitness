import type { NavigatorScreenParams } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { ExerciseSessionResponse, IndividualSessionResponse, PresetSessionResponse } from '@workspace/shared';
import type { FoodInfoItem } from './foodInfo';
import type { FoodEntry } from './foodEntries';
import type { FoodFormData } from '../components/FoodForm';
import type { Exercise } from './exercise';
import type { WorkoutPreset } from './workoutPresets';

export type TabParamList = {
  Dashboard: undefined;
  Diary: { selectedDate?: string } | undefined;
  Add: undefined;
  Workouts: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  FoodSearch: { date?: string } | undefined;
  FoodEntryAdd: { item: FoodInfoItem; date?: string; adjustedValues?: FoodFormData };
  FoodEntryView: { entry: FoodEntry; adjustedValues?: FoodFormData };
  FoodForm:
    | { mode: 'create-food'; date?: string; initialFood?: Partial<FoodFormData>; barcode?: string; providerType?: string }
    | { mode: 'adjust-entry-nutrition'; initialValues: Partial<FoodFormData>; returnTo: 'FoodEntryAdd' | 'FoodEntryView'; returnKey: string };
  FoodScan: { date?: string } | undefined;
  ExerciseSearch: { returnKey: string };
  PresetSearch: { date?: string } | undefined;
  WorkoutForm: {
    session?: PresetSessionResponse;
    preset?: WorkoutPreset;
    date?: string;
    popCount?: number;
    selectedExercise?: Exercise;
    selectionNonce?: number;
    skipDraftLoad?: boolean;
  } | undefined;
  ActivityForm: { entry?: IndividualSessionResponse; date?: string; popCount?: number; selectedExercise?: Exercise; selectionNonce?: number; skipDraftLoad?: boolean } | undefined;
  WorkoutDetail: { session: ExerciseSessionResponse };
  Logs: undefined;
  Sync: undefined;
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  StackScreenProps<RootStackParamList, T>;
