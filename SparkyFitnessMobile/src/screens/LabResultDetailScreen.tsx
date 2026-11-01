import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { labRangeStatus } from '@workspace/shared';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import LabHistoryChart from '../components/labs/LabHistoryChart';
import LabRangeBar from '../components/labs/LabRangeBar';
import LabStatusBadge from '../components/labs/LabStatusBadge';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  useDeleteLabResult,
  useLabHistory,
  useLabMarkers,
} from '../hooks/useLabResults';
import { formatDateLabel } from '../utils/dateUtils';
import {
  effectiveLabRange,
  formatLabRange,
  formatLabValue,
  labHistoryPoints,
  labMarkerQueryFromId,
  labResultStatus,
  labResultText,
} from '../utils/labResults';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'LabResultDetail'>;

const NO_RANGE = { ref_range_low: null, ref_range_high: null };

/** One marker: its range, a chart over time, and every result with delete. */
const LabResultDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { marker: markerId, name } = route.params;
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const { markers } = useLabMarkers();
  const marker = markers.find((m) => m.id === markerId);
  const history = useLabHistory(labMarkerQueryFromId(markerId));
  const deleteResult = useDeleteLabResult();
  useRefetchOnFocus(() => void history.refetch(), true);

  const title =
    marker?.name ??
    name ??
    t('screens.labResultDetail', { defaultValue: 'Lab result' });
  const header = useScreenHeader({
    title,
    nativeTitle: title,
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      ionicon: 'add-outline',
      sfSymbol: 'plus',
      role: 'primary',
      accessibilityLabel: t('labs.add', { defaultValue: 'Add lab result' }),
      onPress: () => navigation.navigate('LabResultAdd', { marker: markerId }),
    },
  });

  const results = useMemo(() => history.data ?? [], [history.data]);
  const latest = results[0] ?? null;
  const fallback = marker ?? NO_RANGE;

  // The latest result's own range wins, then the marker's.
  const unit = latest?.unit || marker?.unit || '';
  // The chart shares one scale, so it plots only results in the latest unit.
  const points = labHistoryPoints(results, unit, marker?.ref_range_unit);
  const otherUnitCount =
    results.filter((r) => r.value_numeric !== null).length - points.length;
  const { low, high } = effectiveLabRange(latest, fallback);
  const range = formatLabRange(low, high, unit);

  const confirmDelete = (resultId: string) => {
    Alert.alert(
      t('labs.deleteTitle', { defaultValue: 'Delete result' }),
      t('labs.deleteMessage', {
        defaultValue: 'Delete this lab result?',
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
            deleteResult.mutate(resultId, {
              onError: () =>
                Toast.show({
                  type: 'error',
                  text1: t('labs.deleteFailed', {
                    defaultValue: 'Could not delete the result',
                  }),
                }),
            }),
        },
      ]
    );
  };

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
          gap: 16,
        }}
      >
        {history.isLoading ? (
          <ActivityIndicator />
        ) : history.isError ? (
          <View className="items-center py-8">
            <Text className="text-text-secondary text-base mb-3">
              {t('labs.loadFailed', {
                defaultValue: 'Could not load your lab results.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void history.refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : (
          <>
            <View className="bg-surface rounded-xl p-4 gap-3">
              <View className="flex-row items-end justify-between">
                <View>
                  <Text className="text-text-muted text-xs">
                    {t('labs.latest', { defaultValue: 'Latest' })}
                  </Text>
                  <Text className="text-text-primary text-2xl font-bold">
                    {latest ? labResultText(latest) : '-'}
                  </Text>
                </View>
                {latest && (
                  <LabStatusBadge status={labResultStatus(latest, fallback)} />
                )}
              </View>
              {range && (
                <Text className="text-text-secondary text-sm">
                  {t('labs.referenceRange', {
                    defaultValue: 'Reference range: {{range}}',
                    range,
                  })}
                </Text>
              )}
              {points.length === 1 && low != null && high != null ? (
                <LabRangeBar
                  value={points[0].value}
                  low={low}
                  high={high}
                  unit={unit}
                  status={labRangeStatus(points[0].value, low, high)}
                />
              ) : (
                <LabHistoryChart
                  points={points}
                  refRangeLow={low}
                  refRangeHigh={high}
                />
              )}
              {otherUnitCount > 0 && (
                <Text className="text-text-muted text-xs">
                  {t('labs.chartOtherUnits', {
                    defaultValue_one:
                      '{{count}} result in another unit is not plotted.',
                    defaultValue_other:
                      '{{count}} results in other units are not plotted.',
                    defaultValue:
                      '{{count}} results in other units are not plotted.',
                    count: otherUnitCount,
                  })}
                </Text>
              )}
            </View>

            {results.length > 0 && (
              <View className="bg-surface rounded-xl overflow-hidden">
                {results.map((result, index) => {
                  const resultRange = formatLabRange(
                    result.ref_range_low,
                    result.ref_range_high,
                    result.unit
                  );
                  return (
                    <View
                      key={result.id}
                      className={`px-4 py-3 flex-row items-center justify-between ${
                        index > 0 ? 'border-t border-border-subtle' : ''
                      }`}
                    >
                      <View className="flex-1 mr-3">
                        <Text className="text-text-primary text-base font-semibold">
                          {result.value_numeric !== null
                            ? formatLabValue(
                                result.value_numeric,
                                result.unit || unit
                              )
                            : labResultText(result)}
                        </Text>
                        <Text className="text-text-muted text-xs mt-0.5">
                          {formatDateLabel(result.entry_date, t, dateLocale)}
                          {resultRange ? ` · ${resultRange}` : ''}
                          {result.notes ? ` · ${result.notes}` : ''}
                        </Text>
                      </View>
                      <View className="mr-3">
                        <LabStatusBadge
                          status={labResultStatus(result, fallback)}
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => confirmDelete(result.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ marginLeft: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.delete', {
                          defaultValue: 'Delete',
                        })}
                      >
                        <Icon name="trash" size={20} color="#999" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
};

export default LabResultDetailScreen;
