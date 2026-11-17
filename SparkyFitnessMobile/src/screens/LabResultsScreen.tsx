import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import LabStatusBadge from '../components/labs/LabStatusBadge';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useDeleteLabImports, useLabMarkers } from '../hooks/useLabResults';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { formatDateLabel } from '../utils/dateUtils';
import {
  effectiveLabRange,
  formatLabRange,
  labResultStatus,
  labResultText,
} from '../utils/labResults';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'LabResults'>;

/** The user's lab markers with their latest result and range status. */
const LabResultsScreen: React.FC<Props> = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const { markers, isLoading, isError, refetch } = useLabMarkers();
  const deleteImports = useDeleteLabImports();
  useRefetchOnFocus(() => void refetch(), true);

  const confirmDeleteImports = () => {
    Alert.alert(
      t('labs.import.deleteTitle', { defaultValue: 'Delete imported results' }),
      t('labs.import.deleteMessage', {
        defaultValue:
          'Delete every result that was imported from a report, and any marker of your own left empty? Results you entered yourself are kept.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () =>
            deleteImports.mutate(undefined, {
              onSuccess: ({ results }) =>
                Toast.show({
                  type: 'success',
                  text1: t('labs.import.deleted', {
                    defaultValue_one: 'Deleted {{count}} imported result',
                    defaultValue_other: 'Deleted {{count}} imported results',
                    defaultValue: 'Deleted {{count}} imported results',
                    count: results,
                  }),
                }),
              onError: () =>
                Toast.show({
                  type: 'error',
                  text1: t('labs.import.deleteFailed', {
                    defaultValue: 'Could not delete the imported results',
                  }),
                }),
            }),
        },
      ]
    );
  };

  const header = useScreenHeader({
    title: t('screens.labResults', { defaultValue: 'Lab results' }),
    left: { kind: 'back' },
    right: [
      {
        kind: 'icon',
        ionicon: 'add-outline',
        sfSymbol: 'plus',
        role: 'primary',
        accessibilityLabel: t('labs.add', { defaultValue: 'Add lab result' }),
        onPress: () => navigation.navigate('LabResultAdd', {}),
      },
      {
        kind: 'menu',
        accessibilityLabel: t('labs.moreActions', {
          defaultValue: 'More actions',
        }),
        items: [
          {
            label: t('labs.import.deleteTitle', {
              defaultValue: 'Delete imported results',
            }),
            sfSymbol: 'trash',
            icon: 'trash',
            onPress: confirmDeleteImports,
          },
        ],
        identifier: 'lab-results-menu',
      },
    ],
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
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
              {t('labs.loadFailed', {
                defaultValue: 'Could not load your lab results.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : markers.length === 0 ? (
          <View className="items-center py-8 gap-4">
            <Text className="text-text-secondary text-base text-center">
              {t('labs.empty', {
                defaultValue:
                  'No lab results yet. Add a result like HbA1c, LDL or vitamin D and track it over time.',
              })}
            </Text>
            <Button
              variant="primary"
              onPress={() => navigation.navigate('LabResultAdd', {})}
            >
              {t('labs.add', { defaultValue: 'Add lab result' })}
            </Button>
            <Button
              variant="secondary"
              onPress={() => navigation.navigate('LabReportImport')}
            >
              {t('labs.import.cta', { defaultValue: 'Import from a report' })}
            </Button>
          </View>
        ) : (
          <View className="gap-4">
            <Button
              variant="secondary"
              onPress={() => navigation.navigate('LabReportImport')}
            >
              {t('labs.import.cta', { defaultValue: 'Import from a report' })}
            </Button>
            <View className="bg-surface rounded-xl overflow-hidden">
              {markers.map((marker, index) => {
                const row = marker.latest;
                const unit = row?.unit || marker.unit;
                const status = row ? labResultStatus(row, marker) : 'unknown';
                const { low, high } = effectiveLabRange(row, marker);
                const range = formatLabRange(low, high, unit);
                return (
                  <Pressable
                    key={marker.id}
                    onPress={() =>
                      navigation.navigate('LabResultDetail', {
                        marker: marker.id,
                        name: marker.name,
                      })
                    }
                    className={`px-4 py-3.5 flex-row items-center justify-between ${
                      index > 0 ? 'border-t border-border-subtle' : ''
                    }`}
                    style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                    accessibilityRole="button"
                  >
                    <View className="flex-1 mr-3">
                      <Text className="text-base font-semibold text-text-primary">
                        {marker.name}
                      </Text>
                      <Text className="text-xs text-text-muted mt-0.5">
                        {row
                          ? formatDateLabel(row.entry_date, t, dateLocale)
                          : t('labs.noResults', { defaultValue: 'No results' })}
                        {range ? ` · ${range}` : ''}
                      </Text>
                    </View>
                    <View className="items-end mr-2">
                      <Text
                        className={`text-base font-bold ${
                          status === 'low'
                            ? 'text-text-warning'
                            : status === 'high'
                              ? 'text-text-danger-subtle'
                              : 'text-text-primary'
                        }`}
                      >
                        {row ? labResultText(row) : '-'}
                      </Text>
                      {row && <LabStatusBadge status={status} />}
                    </View>
                    <Icon name="chevron-forward" size={20} color="#999" />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default LabResultsScreen;
