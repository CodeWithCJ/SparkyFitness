import React from 'react';
import { View, Switch, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';

type DiarySettingsScreenProps = RootStackScreenProps<'DiarySettings'>;

const DiarySettingsScreen: React.FC<DiarySettingsScreenProps> = () => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [formEnabled, formDisabled] = useCSSVariable([
    '--color-form-enabled',
    '--color-form-disabled',
  ]) as [string, string];
  const usesNativeHeader = useNativeIOSHeadersActive();

  const diaryCalorieSummaryVisible = useAppPreferencesStore((s) => s.diaryCalorieSummaryVisible);
  const setDiaryCalorieSummaryVisible = useAppPreferencesStore((s) => s.setDiaryCalorieSummaryVisible);
  const diaryMacroSummaryVisible = useAppPreferencesStore((s) => s.diaryMacroSummaryVisible);
  const setDiaryMacroSummaryVisible = useAppPreferencesStore((s) => s.setDiaryMacroSummaryVisible);

  const header = useScreenHeader({ title: 'Diary Settings', left: { kind: 'back' } });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : 'never'}
      >
        <SettingsRowGroup>
          <SettingsRow
            title="Calories"
            subtitle="Show calories summary in Diary"
            rightAccessory={
              <Switch
                value={diaryCalorieSummaryVisible}
                onValueChange={setDiaryCalorieSummaryVisible}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            }
          />
          <SettingsRow
            title="Macronutrients"
            subtitle="Show macros summary in Diary"
            rightAccessory={
              <Switch
                value={diaryMacroSummaryVisible}
                onValueChange={setDiaryMacroSummaryVisible}
                trackColor={{ false: formDisabled, true: formEnabled }}
                thumbColor="#FFFFFF"
              />
            }
          />
        </SettingsRowGroup>
      </ScrollView>
    </View>
  );
};

export default DiarySettingsScreen;
