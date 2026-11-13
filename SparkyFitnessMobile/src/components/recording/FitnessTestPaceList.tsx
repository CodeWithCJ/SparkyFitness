import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  PACE_ZONE_IDS,
  type FitnessTestPaces,
  type PaceChange,
} from '@workspace/shared';
import { paceChangeText, paceRangeText } from '../../utils/fitnessTest';
import { paceZoneName } from '../../utils/paceZones';

export interface FitnessTestPaceListProps {
  paces: FitnessTestPaces;
  unit: 'km' | 'miles';
  /** How the paces moved since the test before; shown beside each zone. */
  change?: PaceChange | null;
}

/** The five training zones a test gave, easy to hard, with how each moved since the last test. */
const FitnessTestPaceList: React.FC<FitnessTestPaceListProps> = ({
  paces,
  unit,
  change,
}) => {
  const { t } = useTranslation();
  const { tempo, marathon, stride } = paces.raceZones;
  const extras = [
    tempo
      ? t('fitnessTest.paces.tempo', {
          range: paceRangeText(
            t,
            tempo.minSecondsPerKm,
            tempo.maxSecondsPerKm,
            unit
          ),
          defaultValue: 'Tempo {{range}}',
        })
      : null,
    marathon
      ? t('fitnessTest.paces.marathon', {
          range: paceRangeText(
            t,
            marathon.minSecondsPerKm,
            marathon.maxSecondsPerKm,
            unit
          ),
          defaultValue: 'Marathon pace {{range}}',
        })
      : null,
    stride
      ? t('fitnessTest.paces.stride', {
          range: paceRangeText(
            t,
            stride.minSecondsPerKm,
            stride.maxSecondsPerKm,
            unit
          ),
          defaultValue: 'Strides {{range}}',
        })
      : null,
  ].filter(Boolean);
  return (
    <View testID="fitness-test-paces">
      {PACE_ZONE_IDS.map((id) => {
        const zone = paces.zones.find((z) => z.id === id);
        if (!zone) return null;
        const moved = change?.zones.find((z) => z.id === id);
        return (
          <View
            key={id}
            testID={`fitness-pace-zone-${id}`}
            className="flex-row items-center justify-between py-1.5"
          >
            <Text className="text-text-primary text-sm">
              {paceZoneName(t, id)}
            </Text>
            <View className="items-end">
              <Text className="text-text-primary text-sm">
                {paceRangeText(
                  t,
                  zone.minSecondsPerKm,
                  zone.maxSecondsPerKm,
                  unit
                )}
              </Text>
              {moved ? (
                <Text
                  className="text-text-muted text-xs"
                  testID={`fitness-pace-change-${id}`}
                >
                  {paceChangeText(
                    t,
                    (moved.minChangeSeconds + moved.maxChangeSeconds) / 2,
                    unit
                  )}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {extras.length > 0 ? (
        <Text className="text-text-secondary text-xs mt-2">
          {extras.join(' · ')}
        </Text>
      ) : null}
    </View>
  );
};

export default FitnessTestPaceList;
