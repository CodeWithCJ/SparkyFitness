import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCSSVariable } from 'uniwind';
import { useCurrentPregnancy, usePregnancyOverview } from '../../../hooks/usePregnancy';
import WeekBanner from './WeekBanner';
import BabyGrowthView from './BabyGrowthView';
import WeeklyChecklist from './WeeklyChecklist';
import FoodMedSafetySearch from './FoodMedSafetySearch';
import AppointmentsCard from './AppointmentsCard';
import Button from '../../ui/Button';
import type { RootStackParamList } from '../../../types/navigation';

/**
 * Pregnancy Overview View for CycleHubScreen (Pregnancy Hub Insights).
 * Focuses on passive overview: gestational milestones, baby growth, weekly checklist,
 * prenatal appointments, and safety search.
 */
const PregnancyOverviewView: React.FC = () => {
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
      <View className="bg-surface rounded-xl p-6 border-0 shadow-sm gap-4 items-center">
        <Text className="text-text-primary text-base font-semibold">Set up your pregnancy</Text>
        <Text className="text-text-secondary text-sm text-center">
          Add your due date to track baby&apos;s growth week by week, count kicks, and time contractions.
        </Text>
        <Button variant="primary" onPress={() => navigation.navigate('PregnancySetup')}>
          Get Started
        </Button>
      </View>
    );
  }

  const gestationalAge = overview?.gestation;

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

      <AppointmentsCard />
      <FoodMedSafetySearch />
    </View>
  );
};

export default PregnancyOverviewView;
