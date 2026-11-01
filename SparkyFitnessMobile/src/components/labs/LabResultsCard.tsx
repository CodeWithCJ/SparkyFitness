import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from '../Icon';
import LabStatusBadge from './LabStatusBadge';
import { useLabMarkers } from '../../hooks/useLabResults';
import { formatDateLabel } from '../../utils/dateUtils';
import { labResultStatus, labResultText } from '../../utils/labResults';
import type { RootStackParamList, TabParamList } from '../../types/navigation';

type LabResultsCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const MAX_ROWS = 4;

/**
 * Newest lab results on the Dashboard. Shows nothing until the user has a lab
 * marker, so it adds no clutter for people who do not track labs.
 */
const LabResultsCard: React.FC<{ navigation: LabResultsCardNavigation }> = ({
  navigation,
}) => {
  const { t, i18n } = useTranslation();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [
    string,
  ];
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const { markers } = useLabMarkers();

  const rows = useMemo(
    () =>
      markers
        .flatMap((marker) =>
          marker.latest ? [{ marker, result: marker.latest }] : []
        )
        .slice(0, MAX_ROWS),
    [markers]
  );

  // Nothing to show until the user has tracked a lab marker.
  if (markers.length === 0) return null;

  // Only a result judged low or high counts: text-only results and markers
  // with no range have no status to be out of range.
  const outOfRange = rows.filter(({ marker, result }) => {
    const status = labResultStatus(result, marker);
    return status === 'low' || status === 'high';
  }).length;

  return (
    <Pressable
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
      onPress={() => navigation.navigate('LabResults')}
      accessibilityRole="button"
      accessibilityLabel={t('labs.card.a11y', {
        defaultValue: 'Lab results',
      })}
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center">
          <Text className="text-md font-bold text-text-secondary">
            {t('labs.card.title', { defaultValue: 'Lab results' })}
          </Text>
        </View>
        <Icon name="chevron-forward" size={14} color={accentPrimary} />
      </View>

      {rows.length === 0 ? (
        <Text className="text-sm text-text-muted py-1">
          {t('labs.card.empty', {
            defaultValue: 'No results yet. Tap to add one.',
          })}
        </Text>
      ) : (
        <>
          {rows.map(({ marker, result }) => (
            <View
              key={marker.id}
              className="flex-row items-center justify-between py-1.5"
            >
              <View className="flex-1 mr-3">
                <Text className="text-sm font-semibold text-text-primary">
                  {marker.name}
                </Text>
                <Text className="text-xs text-text-muted">
                  {formatDateLabel(result.entry_date, t, dateLocale)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-sm font-bold text-text-primary">
                  {labResultText(result)}
                </Text>
                <LabStatusBadge status={labResultStatus(result, marker)} />
              </View>
            </View>
          ))}
          {outOfRange > 0 && (
            <Text className="text-xs text-text-muted mt-1.5">
              {t('labs.card.outOfRange', {
                defaultValue: '{{count}} outside the reference range',
                defaultValue_one: '{{count}} outside the reference range',
                defaultValue_other: '{{count}} outside the reference range',
                count: outOfRange,
              })}
            </Text>
          )}
        </>
      )}
    </Pressable>
  );
};

export default LabResultsCard;
