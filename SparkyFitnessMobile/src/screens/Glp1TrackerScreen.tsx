import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import MedicalDisclaimer from '../components/MedicalDisclaimer';
import Glp1CheckInCard from '../components/glp1/Glp1CheckInCard';
import Glp1InventoryCard from '../components/glp1/Glp1InventoryCard';
import Glp1LogInjectionCard from '../components/glp1/Glp1LogInjectionCard';
import Glp1RecentInjectionsCard from '../components/glp1/Glp1RecentInjectionsCard';
import Glp1SerumCard from '../components/glp1/Glp1SerumCard';
import Glp1TitrationCard from '../components/glp1/Glp1TitrationCard';
import { useMedicationDetail } from '../hooks/useMedications';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useDiaryDateStore } from '../stores/diaryDateStore';
import type { RootStackScreenProps } from '../types/navigation';

type Glp1TrackerScreenProps = RootStackScreenProps<'Glp1Tracker'>;

/**
 * GLP-1 coach for one medication: daily check-in, injection logging with the
 * site body map, modeled level, pen/vial inventory, titration plan and recent
 * injections. Mirrors web Medications. Injection-only cards (log, inventory,
 * history) are hidden for oral GLP-1s, which still get the check-in, level and
 * titration plan.
 */
const Glp1TrackerScreen: React.FC<Glp1TrackerScreenProps> = ({
  route,
  navigation,
}) => {
  const { t } = useTranslation();
  const { medicationId } = route.params;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const selectedDate = useDiaryDateStore((s) => s.selectedDate);
  const { data: med, isLoading } = useMedicationDetail(medicationId);

  const title = t('medications.glp1.tracker.title', {
    defaultValue: 'GLP-1 tracker',
  });
  const header = useScreenHeader({
    title,
    nativeTitle: title,
    left: { kind: 'back' },
  });

  const isInjectable = med?.type_id === 'injection';

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {isLoading || !med ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-text-muted text-base">
            {t('medications.detail.loading', { defaultValue: 'Loading...' })}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
          }}
          contentInsetAdjustmentBehavior={
            usesNativeHeader ? 'automatic' : 'never'
          }
        >
          <Text className="text-2xl font-bold text-text-primary mb-3">
            {med.name}
          </Text>
          <Glp1CheckInCard key={selectedDate} date={selectedDate} />
          {isInjectable && <Glp1LogInjectionCard med={med} />}
          <Glp1SerumCard medicationId={med.id} title={med.name} />
          {isInjectable && (
            <Glp1InventoryCard
              medicationId={med.id}
              onAdd={() =>
                navigation.navigate('Glp1PenForm', { medicationId: med.id })
              }
              onEdit={(penId) =>
                navigation.navigate('Glp1PenForm', {
                  medicationId: med.id,
                  penId,
                })
              }
            />
          )}
          <Glp1TitrationCard
            medicationId={med.id}
            onAdd={() =>
              navigation.navigate('Glp1TitrationForm', {
                medicationId: med.id,
              })
            }
            onEdit={(stepId) =>
              navigation.navigate('Glp1TitrationForm', {
                medicationId: med.id,
                stepId,
              })
            }
          />
          {isInjectable && <Glp1RecentInjectionsCard medicationId={med.id} />}
          <MedicalDisclaimer />
        </ScrollView>
      )}
    </View>
  );
};

export default Glp1TrackerScreen;
