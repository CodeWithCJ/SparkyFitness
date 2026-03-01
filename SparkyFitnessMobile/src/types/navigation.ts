import type { NavigatorScreenParams } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { FoodInfoItem } from './foodInfo';
import type { FoodEntry } from './foodEntries';
import type { FoodFormData } from '../components/FoodForm';

export type TabParamList = {
  Dashboard: undefined;
  Diary: { selectedDate?: string } | undefined;
  Add: undefined;
  Sync: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  FoodSearch: { date?: string } | undefined;
  FoodEntryAdd: { item: FoodInfoItem; date?: string };
  FoodEntryView: { entry: FoodEntry };
  ManualFoodEntry: { date?: string; initialFood?: Partial<FoodFormData>; barcode?: string; providerType?: string } | undefined;
  FoodScan: { date?: string } | undefined;
  Logs: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  StackScreenProps<RootStackParamList, T>;
