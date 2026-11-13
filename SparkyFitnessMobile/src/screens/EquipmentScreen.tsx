import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'Equipment'>;

/**
 * Hub for the gear a person tracks. Shoes and plates & bars so far; a new kind
 * is another `SettingsRow` here plus its own screen.
 */
const EquipmentScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const header = useScreenHeader({
    title: t('equipmentHub.title', { defaultValue: 'Equipment' }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24 + activeWorkoutBarPadding,
        }}
      >
        <SettingsRowGroup>
          <SettingsRow
            icon="exercise-running"
            title={t('shoes.title', { defaultValue: 'Shoes' })}
            subtitle={t('equipmentHub.shoesSubtitle', {
              defaultValue: 'Running shoes and their mileage',
            })}
            onPress={() => navigation.navigate('Shoes')}
            testID="equipment-shoes"
          />
          <SettingsRow
            icon="exercise-weights"
            title={t('plates.title', { defaultValue: 'Plates & bars' })}
            subtitle={t('equipmentHub.platesSubtitle', {
              defaultValue:
                'The bars and plates you own, for the plate calculator',
            })}
            onPress={() => navigation.navigate('PlateInventory')}
            testID="equipment-plates"
          />
        </SettingsRowGroup>
      </ScrollView>
    </View>
  );
};

export default EquipmentScreen;
