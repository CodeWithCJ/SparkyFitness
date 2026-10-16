import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import type { InjectionEntry } from '@workspace/shared';
import Icon from '../Icon';
import { useDeleteInjection, useInjections } from '../../hooks/useGlp1';
import { usePreferences } from '../../hooks/usePreferences';
import { formatDateToTimeLabel } from '../../utils/entryTimeDisplay';
import { formatDateLabel } from '../../utils/dateUtils';
import { injectionSiteLabel } from '../../utils/medicationLocalization';
import { addLog } from '../../services/LogService';

const RECENT_LIMIT = 10;

const Glp1RecentInjectionsCard: React.FC<{ medicationId: string }> = ({
  medicationId,
}) => {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const { preferences } = usePreferences();
  const { data: injections = [] } = useInjections(medicationId);
  const deleteInjection = useDeleteInjection();
  const [iconDanger] = useCSSVariable(['--color-icon-danger']) as [string];

  const recent = [...injections]
    .sort((a, b) => b.injected_at.localeCompare(a.injected_at))
    .slice(0, RECENT_LIMIT);

  const handleDelete = useCallback(
    (injection: InjectionEntry) => {
      Alert.alert(
        t('medications.glp1.recent.deleteTitle', {
          defaultValue: 'Delete injection',
        }),
        t('medications.glp1.recent.deleteMessage', {
          defaultValue:
            'Delete this injection? A dose deducted from a pen or vial is credited back.',
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
              deleteInjection.mutate(injection.id, {
                onError: (error) => {
                  addLog(
                    `Failed to delete injection: ${error.message}`,
                    'ERROR'
                  );
                  Toast.show({
                    type: 'error',
                    text1: t('medications.glp1.recent.deleteFailed', {
                      defaultValue: 'Failed to delete injection',
                    }),
                  });
                },
              }),
          },
        ]
      );
    },
    [deleteInjection, t]
  );

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Text className="text-base font-semibold text-text-primary mb-2">
        {t('medications.glp1.recent.title', {
          defaultValue: 'Recent injections',
        })}
      </Text>
      {recent.length === 0 ? (
        <Text className="text-sm text-text-muted">
          {t('medications.glp1.recent.empty', {
            defaultValue: 'No injections logged yet.',
          })}
        </Text>
      ) : (
        recent.map((injection, index) => (
          <View key={injection.id}>
            {index > 0 && <View className="h-px bg-chrome-border my-2" />}
            <View className="flex-row items-center">
              <View className="flex-1">
                <Text className="text-base text-text-primary">
                  {formatDateLabel(injection.entry_date, t, dateLocale)}
                  {' · '}
                  {formatDateToTimeLabel(
                    new Date(injection.injected_at),
                    preferences?.time_format
                  )}
                </Text>
                <Text className="text-xs text-text-muted mt-0.5">
                  {[
                    injection.site
                      ? injectionSiteLabel(injection.site, t)
                      : null,
                    injection.dose_mg != null
                      ? `${injection.dose_mg} mg`
                      : null,
                    injection.notes,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(injection)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={t('common.delete', {
                  defaultValue: 'Delete',
                })}
                className="ml-3"
              >
                <Icon name="trash" size={18} color={iconDanger} />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </View>
  );
};

export default Glp1RecentInjectionsCard;
