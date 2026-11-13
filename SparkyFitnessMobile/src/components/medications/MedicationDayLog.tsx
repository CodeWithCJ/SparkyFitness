import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { MedicationEntry, MedicationEntryStatus } from '@workspace/shared';
import Icon from '../Icon';
import { usePreferences } from '../../hooks/usePreferences';
import { withAlpha } from '../../utils/colors';
import { formatDateToTimeLabel } from '../../utils/entryTimeDisplay';
import { injectionSiteLabel } from '../../utils/medicationLocalization';
import {
  useMedicationStatusColors,
  type MedicationStatusColors,
} from './useMedicationStatusColors';

interface MedicationDayLogProps {
  title: string;
  description: string;
  entries: MedicationEntry[];
  isLoading: boolean;
  onEdit: (entry: MedicationEntry) => void;
  onDelete: (entry: MedicationEntry) => void;
  /** Disables the actions while a change is being saved. */
  busy?: boolean;
}

const statusChipColor = (
  status: MedicationEntryStatus,
  colors: MedicationStatusColors
): string => {
  switch (status) {
    case 'taken':
      return colors.success;
    case 'prn_taken':
      return colors.success;
    case 'snoozed':
      return colors.warning;
    case 'skipped':
      return colors.neutral;
  }
};

/**
 * Everything taken or skipped on the selected day, newest last, with edit and delete.
 * Injection rows come from the same feed and are handled by the caller's callbacks.
 */
const MedicationDayLog: React.FC<MedicationDayLogProps> = ({
  title,
  description,
  entries,
  isLoading,
  onEdit,
  onDelete,
  busy = false,
}) => {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const colors = useMedicationStatusColors();
  const [iconDecorative, iconDanger] = useCSSVariable([
    '--color-icon-decorative',
    '--color-icon-danger',
  ]) as [string, string];

  const sorted = [...entries].sort((a, b) =>
    a.taken_at.localeCompare(b.taken_at)
  );

  const statusLabel = (status: MedicationEntryStatus): string => {
    switch (status) {
      case 'taken':
        return t('medications.dose.taken', { defaultValue: 'Taken' });
      case 'prn_taken':
        return t('medications.today.prnTaken', { defaultValue: 'As needed' });
      case 'snoozed':
        return t('medications.today.snoozed', { defaultValue: 'Snoozed' });
      case 'skipped':
        return t('medications.dose.skipped', { defaultValue: 'Skipped' });
    }
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Text className="text-base font-semibold text-text-primary">{title}</Text>
      <Text className="text-sm text-text-secondary mt-0.5 mb-2">
        {description}
      </Text>

      {isLoading ? (
        <Text className="text-sm text-text-muted py-4 text-center">
          {t('medications.today.loadingHistory', {
            defaultValue: 'Loading history…',
          })}
        </Text>
      ) : sorted.length === 0 ? (
        <Text className="text-sm text-text-muted py-4 text-center">
          {t('medications.dayLog.empty', {
            defaultValue: 'Nothing logged for this day.',
          })}
        </Text>
      ) : (
        sorted.map((entry, index) => {
          const chipColor = statusChipColor(entry.status, colors);
          const name =
            entry.med_name_snapshot ??
            t('medications.dayLog.unknownMedication', {
              defaultValue: 'Medication',
            });
          const detail = [
            entry.site ? injectionSiteLabel(entry.site, t) : null,
            entry.notes,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <View key={entry.id} testID={`day-log-entry-${entry.id}`}>
              {index > 0 && <View className="h-px bg-chrome-border my-2" />}
              <View className="flex-row items-center">
                <View className="flex-1">
                  <Text
                    className="text-base font-medium text-text-primary"
                    numberOfLines={1}
                  >
                    {name}
                  </Text>
                  <View className="flex-row items-center mt-1">
                    <Text
                      className="text-sm text-text-secondary"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {formatDateToTimeLabel(
                        new Date(entry.taken_at),
                        preferences?.time_format
                      )}
                    </Text>
                    <View
                      className="ml-2 rounded-full px-2 py-0.5"
                      style={{ backgroundColor: withAlpha(chipColor, 0.15) }}
                    >
                      <Text
                        className="text-xs font-semibold"
                        style={{ color: chipColor }}
                      >
                        {statusLabel(entry.status)}
                      </Text>
                    </View>
                  </View>
                  {detail !== '' && (
                    <Text
                      className="text-xs text-text-muted mt-1"
                      numberOfLines={2}
                    >
                      {detail}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => onEdit(entry)}
                  disabled={busy}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={t('medications.dayLog.editA11y', {
                    defaultValue: 'Edit {{name}}',
                    name,
                  })}
                  className="ml-3"
                >
                  <Icon name="pencil" size={18} color={iconDecorative} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onDelete(entry)}
                  disabled={busy}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={t('medications.dayLog.deleteA11y', {
                    defaultValue: 'Delete {{name}}',
                    name,
                  })}
                  className="ml-4"
                >
                  <Icon name="trash" size={18} color={iconDanger} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
};

export default MedicationDayLog;
