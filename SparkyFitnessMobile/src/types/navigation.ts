import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { IndividualSessionResponse, PresetSessionResponse } from '@workspace/shared';
import type { FoodInfoItem } from './foodInfo';
import type { FoodEntry } from './foodEntries';
import type { FoodFormData } from '../components/FoodForm';
import type { Exercise } from './exercise';
import type { WorkoutPreset } from './workoutPresets';

export type TabParamList = {
  Dashboard: undefined;
  Diary: { selectedDate?: string } | undefined;
  Add: undefined;
  Library: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  WorkoutHistory: undefined;
  FoodsLibrary: undefined;
  FoodDetail: { item: FoodInfoItem };
  FoodSearch: { date?: string } | undefined;
  FoodEntryAdd: { item: FoodInfoItem; date?: string; adjustedValues?: FoodFormData };
  FoodEntryView: { entry: FoodEntry; adjustedValues?: FoodFormData };
  FoodForm:
    | { mode: 'create-food'; date?: string; initialFood?: Partial<FoodFormData>; barcode?: string; providerType?: string }
    | { mode: 'adjust-entry-nutrition'; initialValues: Partial<FoodFormData>; returnTo: 'FoodEntryAdd' | 'FoodEntryView'; returnKey: string; foodId?: string; variantId?: string; customNutrients?: Record<string, string | number> | null };
  FoodScan: { date?: string } | undefined;
  ExerciseSearch: { returnKey: string };
  PresetSearch: { date?: string } | undefined;
  WorkoutAdd: {
    session?: PresetSessionResponse;
    preset?: WorkoutPreset;
    date?: string;
    popCount?: number;
    selectedExercise?: Exercise;
    selectionNonce?: number;
    skipDraftLoad?: boolean;
  } | undefined;
  ActivityAdd: { entry?: IndividualSessionResponse; date?: string; popCount?: number; selectedExercise?: Exercise; selectionNonce?: number; skipDraftLoad?: boolean } | undefined;
  WorkoutDetail: { session: PresetSessionResponse; selectedExercise?: Exercise; selectionNonce?: number };
  ActivityDetail: { session: IndividualSessionResponse };
  Logs: undefined;
  Sync: undefined;
  CalorieSettings: undefined;
  FoodSettings: undefined;
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
