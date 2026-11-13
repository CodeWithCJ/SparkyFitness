import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  buildMonthGrid,
  dayDoseTotal,
  dayLogStatus,
  isEntryVisibleForSubtype,
  monthDoseTotal,
  tallyEntriesByDay,
  tallySymptomsByDay,
  type DayLogStatus,
  type MedSubtype,
  type MedicationDetail,
} from '@workspace/shared';
import BottomSheetPicker, { type PickerOption } from '../BottomSheetPicker';
import Icon from '../Icon';
import { useMedicationEntries } from '../../hooks/useMedications';
import { useSymptomEntries } from '../../hooks/useSymptoms';
import { usePreferences } from '../../hooks/usePreferences';
import {
  formatMonthLabel,
  shiftMonth,
  weekdayHeaders,
} from '../../utils/medicationAdherence';
import {
  useMedicationStatusColors,
  type MedicationStatusColors,
} from './useMedicationStatusColors';

/** Picker value meaning "every medication". */
const ALL_MEDS = '__all__';

interface MedicationLogCalendarProps {
  /** Already narrowed by the meds/supplements filter. */
  medications: MedicationDetail[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  subtype: MedSubtype;
}

const statusColor = (
  status: DayLogStatus,
  colors: MedicationStatusColors
): string => {
  switch (status) {
    case 'all_taken':
      return colors.success;
    case 'partial':
      return colors.warning;
    case 'mostly_skipped':
      return colors.orange;
    case 'all_skipped':
      return colors.danger;
    case 'snoozed_only':
      return colors.neutral;
  }
};

/**
 * A month of logged doses, one circle per day coloured by how complete the day was, with
 * a dose-count badge and dots for side-effect and general symptoms. Tapping a day selects
 * it; the filter narrows the month to one medication.
 */
const MedicationLogCalendar: React.FC<MedicationLogCalendarProps> = ({
  medications,
  selectedDate,
  onSelectDate,
  subtype,
}) => {
  const { t, i18n } = useTranslation();
  const { preferences } = usePreferences();
  const colors = useMedicationStatusColors();
  const [textPrimary, accentPrimary, textOnFill] = useCSSVariable([
    '--color-text-primary',
    '--color-accent-primary',
    '--color-accent-text',
  ]) as [string, string, string];

  const firstDayOfWeek =
    typeof preferences?.first_day_of_week === 'number' &&
    preferences.first_day_of_week >= 0 &&
    preferences.first_day_of_week <= 6
      ? preferences.first_day_of_week
      : 0;

  const [month, setMonth] = useState(() => selectedDate.slice(0, 7));
  const [selectedMedId, setSelectedMedId] = useState(ALL_MEDS);

  // Picking a day elsewhere (the adjacent-month cells, Back to today) brings its month in.
  useEffect(() => {
    setMonth(selectedDate.slice(0, 7));
  }, [selectedDate]);

  const loggableMeds = useMemo(
    () => medications.filter((m) => m.is_active),
    [medications]
  );
  const visibleMedIds = useMemo(
    () => new Set(medications.map((m) => m.id)),
    [medications]
  );

  // A selection made under one filter can outlive a switch that hides it.
  const activeMedId =
    selectedMedId !== ALL_MEDS && visibleMedIds.has(selectedMedId)
      ? selectedMedId
      : undefined;

  const [year, monthNumber] = month.split('-').map(Number);
  const grid = useMemo(
    () => buildMonthGrid(year ?? 1970, monthNumber ?? 1, firstDayOfWeek),
    [year, monthNumber, firstDayOfWeek]
  );

  const { data: entries = [] } = useMedicationEntries({
    fromDate: grid.gridStart,
    toDate: grid.gridEnd,
    medicationId: activeMedId,
  });
  // Symptoms are a separate permission; without it the query fails and the month simply
  // shows no symptom dots.
  const { entries: symptoms } = useSymptomEntries({
    fromDate: grid.gridStart,
    toDate: grid.gridEnd,
  });

  const include = useMemo(
    () => (medicationId: string) =>
      isEntryVisibleForSubtype(medicationId, visibleMedIds, subtype),
    [visibleMedIds, subtype]
  );
  const entriesByDay = useMemo(
    () => tallyEntriesByDay(entries, { medicationId: activeMedId, include }),
    [entries, activeMedId, include]
  );
  const symptomsByDay = useMemo(
    () => tallySymptomsByDay(symptoms, { medicationId: activeMedId, include }),
    [symptoms, activeMedId, include]
  );
  const monthTotal = useMemo(
    () => monthDoseTotal(entriesByDay, month),
    [entriesByDay, month]
  );

  const filterOptions = useMemo<PickerOption<string>[]>(
    () => [
      {
        label:
          subtype === 'supplements'
            ? t('medications.calendar.allSupplements', {
                defaultValue: 'All supplements',
              })
            : subtype === 'meds'
              ? t('medications.calendar.allMedications', {
                  defaultValue: 'All medications',
                })
              : t('medications.calendar.allEntries', { defaultValue: 'All' }),
        value: ALL_MEDS,
      },
      ...loggableMeds.map((m) => ({
        label: m.display_name || m.name,
        value: m.id,
      })),
    ],
    [loggableMeds, subtype, t]
  );

  const monthLabel = formatMonthLabel(month, i18n.language);
  const headers = useMemo(
    () => weekdayHeaders(firstDayOfWeek, i18n.language),
    [firstDayOfWeek, i18n.language]
  );

  const legend = [
    {
      key: 'allTaken',
      label: t('medications.calendar.allTaken', {
        defaultValue: 'All doses taken',
      }),
      color: colors.success,
    },
    {
      key: 'partialTaken',
      label: t('medications.calendar.partialTaken', {
        defaultValue: 'Partially taken',
      }),
      color: colors.warning,
    },
    {
      key: 'mostlySkipped',
      label: t('medications.calendar.mostlySkipped', {
        defaultValue: 'Mostly skipped',
      }),
      color: colors.orange,
    },
    {
      key: 'allSkipped',
      label: t('medications.calendar.allSkipped', {
        defaultValue: 'All doses skipped',
      }),
      color: colors.danger,
    },
    {
      key: 'snoozedOnly',
      label: t('medications.calendar.snoozedOnly', {
        defaultValue: 'Snoozed only',
      }),
      color: colors.neutral,
    },
    {
      key: 'sideEffect',
      label: t('medications.calendar.sideEffect', {
        defaultValue: 'Side-effect symptom',
      }),
      color: colors.sideEffect,
      dot: true,
    },
    {
      key: 'generalSymptom',
      label: t('medications.calendar.generalSymptom', {
        defaultValue: 'General symptom',
      }),
      color: colors.generalSymptom,
      dot: true,
    },
  ];

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Text className="text-base font-semibold text-text-primary mb-3">
        {subtype === 'supplements'
          ? t('medications.calendar.titleSupplements', {
              defaultValue: 'Supplement Log Calendar',
            })
          : subtype === 'meds'
            ? t('medications.calendar.title', {
                defaultValue: 'Medication Log Calendar',
              })
            : t('medications.calendar.titleAll', {
                defaultValue: 'Log Calendar',
              })}
      </Text>

      {loggableMeds.length === 0 ? (
        <Text className="text-sm text-text-muted text-center py-6">
          {t('medications.calendar.empty', {
            defaultValue: 'Add a medication to see its log calendar here.',
          })}
        </Text>
      ) : (
        <>
          <BottomSheetPicker
            value={activeMedId ?? ALL_MEDS}
            options={filterOptions}
            onSelect={setSelectedMedId}
            title={t('medications.calendar.filterTitle', {
              defaultValue: 'Show',
            })}
          />
          <Text className="text-xs text-text-secondary mt-2">
            {t('medications.calendar.monthTotal', {
              defaultValue: '{{count}} doses logged in {{month}}',
              count: monthTotal,
              month: monthLabel,
            })}
          </Text>

          <View className="flex-row justify-between items-center mt-3 mb-2">
            <Pressable
              onPress={() => setMonth((m) => shiftMonth(m, -1))}
              hitSlop={10}
              className="p-2"
              accessibilityRole="button"
              accessibilityLabel={t('medications.calendar.previousMonth', {
                defaultValue: 'Previous month',
              })}
            >
              <Icon name="chevron-back" size={20} color={textPrimary} />
            </Pressable>
            <Text className="text-text-primary text-base font-bold">
              {monthLabel}
            </Text>
            <Pressable
              onPress={() => setMonth((m) => shiftMonth(m, 1))}
              hitSlop={10}
              className="p-2"
              accessibilityRole="button"
              accessibilityLabel={t('medications.calendar.nextMonth', {
                defaultValue: 'Next month',
              })}
            >
              <Icon name="chevron-forward" size={20} color={textPrimary} />
            </Pressable>
          </View>

          <View className="flex-row mb-1">
            {headers.map((label, index) => (
              <Text
                key={index}
                className="flex-1 text-center text-text-secondary text-xs font-semibold py-1"
              >
                {label}
              </Text>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {grid.days.map((day) => {
              const counts = entriesByDay[day];
              const symptomInfo = symptomsByDay[day];
              const status = counts ? dayLogStatus(counts) : null;
              const total = counts ? dayDoseTotal(counts) : 0;
              const inMonth = day.startsWith(month);
              const isSelected = day === selectedDate;
              const dayNumber = Number(day.slice(8, 10));
              const fill = status ? statusColor(status, colors) : undefined;

              const parts: string[] = [];
              if (counts) {
                if (counts.taken > 0)
                  parts.push(
                    t('medications.calendar.tooltipTaken', {
                      defaultValue: '{{count}} taken',
                      count: counts.taken,
                    })
                  );
                if (counts.prn > 0)
                  parts.push(
                    t('medications.calendar.tooltipPrn', {
                      defaultValue: '{{count}} as needed',
                      count: counts.prn,
                    })
                  );
                if (counts.skipped > 0)
                  parts.push(
                    t('medications.calendar.tooltipSkipped', {
                      defaultValue: '{{count}} skipped',
                      count: counts.skipped,
                    })
                  );
                if (counts.snoozed > 0)
                  parts.push(
                    t('medications.calendar.tooltipSnoozed', {
                      defaultValue: '{{count}} snoozed',
                      count: counts.snoozed,
                    })
                  );
              }
              if (symptomInfo && symptomInfo.names.length > 0) {
                parts.push(
                  t('medications.calendar.tooltipSymptoms', {
                    defaultValue: 'Symptoms: {{names}}',
                    names: symptomInfo.names.join(', '),
                  })
                );
              }

              return (
                <Pressable
                  key={day}
                  onPress={() => onSelectDate(day)}
                  testID={`med-cal-day-${day}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={[day, ...parts].join(', ')}
                  style={{
                    width: '14.2857%',
                    aspectRatio: 1,
                    padding: 3,
                    opacity: inMonth ? 1 : 0.4,
                  }}
                >
                  <View
                    testID={
                      status ? `med-cal-fill-${day}-${status}` : undefined
                    }
                    style={{
                      flex: 1,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: fill,
                      borderWidth: isSelected ? 2 : 0,
                      borderColor: accentPrimary,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '500',
                        color: fill ? textOnFill : textPrimary,
                      }}
                    >
                      {dayNumber}
                    </Text>
                    {total > 1 && (
                      <View
                        testID={`med-cal-count-${day}`}
                        className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full items-center justify-center"
                        style={{ backgroundColor: accentPrimary }}
                      >
                        <Text
                          className="text-[9px] font-bold"
                          style={{ color: textOnFill }}
                        >
                          {total}
                        </Text>
                      </View>
                    )}
                    {(symptomInfo?.sideEffect || symptomInfo?.general) && (
                      <View
                        className="absolute flex-row"
                        style={{ bottom: 3, columnGap: 2 }}
                      >
                        {symptomInfo.sideEffect && (
                          <View
                            testID={`med-cal-side-effect-${day}`}
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 3,
                              backgroundColor: colors.sideEffect,
                            }}
                          />
                        )}
                        {symptomInfo.general && (
                          <View
                            testID={`med-cal-general-${day}`}
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 3,
                              backgroundColor: colors.generalSymptom,
                            }}
                          />
                        )}
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-3 pt-3 border-t border-border-subtle flex-row flex-wrap gap-x-4 gap-y-2">
            {legend.map((item) => (
              <View key={item.key} className="flex-row items-center">
                <View
                  style={{
                    width: item.dot ? 8 : 12,
                    height: item.dot ? 8 : 12,
                    borderRadius: 6,
                    backgroundColor: item.color,
                  }}
                />
                <Text className="text-xs text-text-secondary ml-1.5">
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
};

export default MedicationLogCalendar;
