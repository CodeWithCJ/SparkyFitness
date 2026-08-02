import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCSSVariable } from 'uniwind';
import { useCurrentPregnancy, usePregnancyOverview } from '../../../hooks/usePregnancy';
import WeekBanner from './WeekBanner';
import BabyGrowthView from './BabyGrowthView';
import WeeklyChecklist from './WeeklyChecklist';
import BumpPhotoJournal from './BumpPhotoJournal';
import FoodMedSafetySearch from './FoodMedSafetySearch';
import Button from '../../ui/Button';
import type { RootStackParamList } from '../../../types/navigation';

interface PregnancyOverviewViewProps {
  /**
   * `overview` renders this week's content (week banner, baby growth, weekly
   * checklist); `tools` renders the interactive cards (bump photo journal,
   * safety search).
   */
  section: 'overview' | 'tools';
}

/**
 * Pregnancy views for the CycleHubScreen (Pregnancy Hub) Overview and Tools
 * segments. Both sections share the pregnancy/overview queries and the
 * setup prompt shown when no active pregnancy exists.
 */
const PregnancyOverviewView: React.FC<PregnancyOverviewViewProps> = ({ section }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  const { pregnancy, isLoading: isPregnancyLoading } = useCurrentPregnancy();
  const hasActive = !!pregnancy && pregnancy.status === 'active';
  const { overview, isLoading: isOverviewLoading } = usePregnancyOverview(undefined, hasActive);

  if (isPregnancyLoading) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  if (!hasActive) {
    return (
      <View className="bg-surface rounded-xl p-6 shadow-sm gap-4 items-center">
        <Text className="text-text-primary text-base font-semibold">Set up your pregnancy</Text>
        <Text className="text-text-secondary text-sm text-center">
          Add your due date to track baby&apos;s growth week by week and keep a bump photo journal.
        </Text>
        <Button variant="primary" onPress={() => navigation.navigate('PregnancySetup')}>
          Get Started
        </Button>
      </View>
    );
  }

  const gestationalAge = overview?.gestation;

  if (section === 'tools') {
    return (
      <View className="gap-4">
        {isOverviewLoading || !gestationalAge || !pregnancy?.id ? (
          <View className="items-center py-8">
            <ActivityIndicator color={accentColor} />
          </View>
        ) : (
          <BumpPhotoJournal pregnancyId={pregnancy.id} currentWeek={gestationalAge.week} />
        )}

        <FoodMedSafetySearch />
      </View>
    );
  }

  return (
    <View className="gap-4">
      {isOverviewLoading || !gestationalAge || !pregnancy ? (
        <View className="items-center py-8">
          <ActivityIndicator color={accentColor} />
        </View>
      ) : (
        <>
          <WeekBanner
            ga={gestationalAge}
            dueDate={pregnancy.due_date}
            onEdit={() => navigation.navigate('PregnancySetup', { pregnancy })}
          />
          <BabyGrowthView week={gestationalAge.week} />
          {pregnancy?.id && (
            <WeeklyChecklist pregnancyId={pregnancy.id} currentWeek={gestationalAge.week} />
          )}
        </>
      )}
    </View>
  );
};

export default PregnancyOverviewView;
