import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCSSVariable } from 'uniwind';
import { useCurrentPregnancy, usePregnancyOverview } from '../../../hooks/usePregnancy';
import VitalsCard from './VitalsCard';
import KickCounter from './KickCounter';
import ContractionTimer from './ContractionTimer';
import BumpPhotoJournal from './BumpPhotoJournal';
import Button from '../../ui/Button';
import type { RootStackParamList } from '../../../types/navigation';
import { getTodayDate } from '../../../utils/dateUtils';

interface PregnancyLogViewProps {
  date?: string;
  onSaveSuccess?: () => void;
}

/**
 * Active Pregnancy Logging View for CycleLogModalScreen.
 * Contains interactive tools: Vitals logging (weight/BP), kick counter, contraction timer,
 * bump photos, and pregnancy symptoms/notes.
 */
const PregnancyLogView: React.FC<PregnancyLogViewProps> = ({ date = getTodayDate(), onSaveSuccess }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  const { pregnancy, isLoading: isPregnancyLoading } = useCurrentPregnancy();
  const hasActive = !!pregnancy && pregnancy.status === 'active';
  const { overview } = usePregnancyOverview(undefined, hasActive);

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

  const currentWeek = overview?.gestation?.week ?? 0;

  return (
    <View className="gap-4">
      {/* Vitals (Weight & BP) */}
      {pregnancy && <VitalsCard pregnancy={pregnancy} />}

      {/* Kick Counter, Contraction Timer & Bump Photos */}
      {pregnancy?.id && (
        <>
          <KickCounter pregnancyId={pregnancy.id} />
          <ContractionTimer pregnancyId={pregnancy.id} />
          <BumpPhotoJournal
            pregnancyId={pregnancy.id}
            currentWeek={currentWeek}
          />
        </>
      )}
    </View>
  );
};

export default PregnancyLogView;
