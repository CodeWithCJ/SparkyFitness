import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCSSVariable } from 'uniwind';
import { useCurrentPregnancy, usePregnancyOverview } from '../../../hooks/usePregnancy';
import WeekBanner from './WeekBanner';
import BabyGrowthView from './BabyGrowthView';
import VitalsCard from './VitalsCard';
import WeeklyChecklist from './WeeklyChecklist';
import KickCounter from './KickCounter';
import ContractionTimer from './ContractionTimer';
import BumpPhotoJournal from './BumpPhotoJournal';
import FoodMedSafetySearch from './FoodMedSafetySearch';
import AppointmentsCard from './AppointmentsCard';
import Button from '../../ui/Button';
import type { RootStackParamList } from '../../../types/navigation';

/**
 * Pregnant/postpartum "Today" view. Swapped in for the cycle log form by
 * CycleHubScreen. Prompts for setup when no active pregnancy exists, otherwise
 * shows gestational progress, baby growth, and the kick/contraction tools.
 */
const PregnancyTodayView: React.FC = () => {
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
      <View className="bg-surface rounded-2xl p-6 border border-border-subtle shadow-sm gap-4 items-center">
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

  // The server's /pregnancy/overview endpoint returns just { pregnancy: null }
  // (no `gestation`) whenever it can't resolve an active pregnancy — which can
  // happen transiently right after creating/ending one, while `hasActive`
  // (derived from the separate /current query) is still stale-true. Never
  // assume a truthy `overview` implies `gestation` is present. Due date comes
  // from the pregnancy record itself — `overview` has no top-level `dueDate`.
  const gestationalAge = overview?.gestation;
  const currentWeek = gestationalAge?.week;

  return (
    <View className="gap-6">
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
          {pregnancy && <VitalsCard pregnancy={pregnancy} />}
          {pregnancy?.id && (
            <WeeklyChecklist pregnancyId={pregnancy.id} currentWeek={gestationalAge.week} />
          )}
        </>
      )}

      {pregnancy?.id && (
        <>
          <KickCounter pregnancyId={pregnancy.id} />
          <ContractionTimer pregnancyId={pregnancy.id} />
          <BumpPhotoJournal
            pregnancyId={pregnancy.id}
            currentWeek={currentWeek ?? 0}
          />
        </>
      )}

      {/* NOTE: appointments are mode-agnostic (health_appointments.pregnancy_id
          is nullable), but with no Care hub yet, the pregnant-mode Today view
          is their home for now. Could move to a shared location later. */}
      <AppointmentsCard />

      <FoodMedSafetySearch />
    </View>
  );
};

export default PregnancyTodayView;
