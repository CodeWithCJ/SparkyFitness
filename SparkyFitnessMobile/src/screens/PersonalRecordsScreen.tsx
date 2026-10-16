import React from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../components/ui/Button';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePersonalRecords } from '../hooks/usePersonalRecords';
import { formatDayLabel } from '../utils/dayLabel';
import {
  distanceStandardLabel,
  groupPersonalRecords,
  sportGroupLabel,
} from '../utils/personalRecords';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'PersonalRecords'>;

/**
 * Best efforts at the standard distances, per sport (running, walking,
 * cycling...), as the server finds them in the recorded and imported cardio.
 */
const PersonalRecordsScreen: React.FC<Props> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { records, isLoading, isError, refetch } = usePersonalRecords();
  useRefetchOnFocus(refetch, true);
  const header = useScreenHeader({
    title: t('screens.personalRecords', { defaultValue: 'Personal records' }),
    left: { kind: 'back' },
  });
  const groups = groupPersonalRecords(records);

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {isLoading ? (
          <ActivityIndicator />
        ) : isError ? (
          <View className="items-center py-8">
            <Text className="text-text-secondary text-base mb-3">
              {t('personalRecords.loadFailed', {
                defaultValue: 'Could not load your records.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : groups.length === 0 ? (
          <Text className="text-text-secondary text-base text-center py-8">
            {t('personalRecords.empty', {
              defaultValue:
                'No records yet. Record or import a run, walk or ride of at least 1 km and your best efforts show up here.',
            })}
          </Text>
        ) : (
          groups.map(({ group, items }) => (
            <View key={group} className="bg-surface rounded-xl p-4 mb-4">
              <Text className="text-text-primary text-base font-bold mb-2">
                {sportGroupLabel(t, group)}
              </Text>
              {items.map((item) => (
                <View
                  key={`${group}-${item.distanceStandard}-${item.activityId}`}
                  className="flex-row items-center justify-between py-2"
                  accessibilityLabel={t('personalRecords.rowA11y', {
                    defaultValue: '{{distance}}, {{time}}, {{pace}}, {{date}}',
                    distance: distanceStandardLabel(t, item),
                    time: item.formattedTime,
                    pace: item.formattedPace,
                    date: formatDayLabel(item.achievedAt),
                  })}
                  accessible
                >
                  <View className="flex-1 mr-3">
                    <Text className="text-text-primary text-base font-semibold">
                      {distanceStandardLabel(t, item)}
                    </Text>
                    <Text className="text-text-muted text-xs mt-0.5">
                      {formatDayLabel(item.achievedAt)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-text-primary text-base font-bold">
                      {item.formattedTime}
                    </Text>
                    <Text className="text-text-muted text-xs mt-0.5">
                      {item.formattedPace}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
};

export default PersonalRecordsScreen;
