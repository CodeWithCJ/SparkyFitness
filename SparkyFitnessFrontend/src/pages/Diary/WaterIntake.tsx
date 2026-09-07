import { useState } from 'react';
import { instantHourMinute, dayToUtcRange } from '@workspace/shared';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Droplet,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Star,
  Plus,
  Minus,
  Trash2,
  Utensils,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { convertMlToSelectedUnit } from '@/utils/nutritionCalculations';
import { describeContainerPress } from '@/utils/waterContainerLabels';
import { isManualSource, prettifySource } from '@/utils/sourceLabels';
import { useWaterContainer } from '@/contexts/WaterContainerContext';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  useWaterGoalQuery,
  useWaterIntakeQuery,
  useManualWaterIntakeQuery,
  useFoodWaterIntakeQuery,
  useUpdateWaterIntakeMutation,
  useWaterIntakeLogQuery,
  useDeleteWaterIntakeLogMutation,
  useUpdateWaterIntakeLogTimeMutation,
} from '@/hooks/Diary/useWaterIntake';

interface WaterIntakeProps {
  selectedDate: string;
}

const WaterIntake = ({ selectedDate }: WaterIntakeProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser(); // Get activeUserId
  const { activeContainer, standardContainers, quickAddPresets } =
    useWaterContainer();
  const { water_display_unit } = usePreferences();
  const userId = activeUserId || user?.id;
  const { data: waterGoalMl = 1920 } = useWaterGoalQuery(selectedDate, userId);
  const { data: waterMl = 0 } = useWaterIntakeQuery(selectedDate, userId);
  // Only manually logged water can be removed here; provider-synced water is
  // owned by its provider and would just reappear on the next sync.
  const { data: manualWaterMl = 0 } = useManualWaterIntakeQuery(
    selectedDate,
    userId
  );
  const { data: foodWaterMl = 0 } = useFoodWaterIntakeQuery(
    selectedDate,
    userId
  );
  const { mutate: updateWaterIntake, isPending: loading } =
    useUpdateWaterIntakeMutation();
  const { data: logEntries = [] } = useWaterIntakeLogQuery(
    selectedDate,
    userId
  );
  const { mutate: deleteLogEntry, isPending: deleting } =
    useDeleteWaterIntakeLogMutation();
  const { mutate: updateLogTime } = useUpdateWaterIntakeLogTimeMutation();

  // Local state for the selected container in the diary
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(
    () => activeContainer?.id ?? null
  );

  // Local state for log panel visibility (defaults to open so synced/manual logs are immediately visible)
  const [showLog, setShowLog] = useState(true);

  // State for editing time on a log entry
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);

  // Derived selected container from standard containers only
  const currentContainer =
    standardContainers.find((c) => c.id === selectedContainerId) ||
    activeContainer;

  const cycleContainer = (direction: 'next' | 'prev') => {
    if (standardContainers.length <= 1) return;

    const currentIndex = standardContainers.findIndex(
      (c) => c.id === currentContainer?.id
    );
    let nextIndex;

    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % standardContainers.length;
    } else {
      nextIndex =
        (currentIndex - 1 + standardContainers.length) %
        standardContainers.length;
    }

    const nextContainer = standardContainers[nextIndex];
    if (nextContainer) {
      setSelectedContainerId(nextContainer.id);
    }
  };
  const saveWaterIntake = (
    changeDrinks: number,
    containerId: number | null
  ) => {
    if (!userId) {
      return;
    }
    updateWaterIntake({
      user_id: userId,
      entry_date: selectedDate,
      change_drinks: changeDrinks,
      container_id: containerId,
    });
  };

  const adjustWater = (changeDrinks: number) => {
    saveWaterIntake(changeDrinks, currentContainer?.id || null);
  };

  const getVolumeDisplay = () => {
    if (currentContainer) {
      // Mirror the server's precedence (measurementService, #2115) so the label
      // and the ring can never disagree: an explicit container volume wins,
      // otherwise a linked food supplies its own water, scaled by how much of
      // it one press logs. This used to always show volume / servings, so a
      // linked container promised "+500 ml" and credited the food's 22.
      const servings = Math.max(
        1,
        currentContainer.servings_per_container || 1
      );
      const hasVolumeOverride =
        !currentContainer.linked_food_id || currentContainer.volume > 0;
      // water_ml is stored per serving_size, so the credit for linked_quantity
      // of it is water * quantity / serving_size -- the same scaling the server
      // applies. Without the divisor a 250 ml drink read as 5500 ml.
      const linkedServingSize =
        Number(currentContainer.linked_variant_serving_size) || 0;
      const linkedWater =
        Number(currentContainer.linked_variant_water_ml ?? 0) *
        Number(currentContainer.linked_quantity ?? 1);
      const volumePerDrink = hasVolumeOverride
        ? currentContainer.volume / servings
        : linkedServingSize > 0
          ? linkedWater / linkedServingSize
          : linkedWater;
      const credited =
        volumePerDrink * Number(currentContainer.hydration_factor ?? 1);
      const displayVolume = convertMlToSelectedUnit(
        credited,
        displayUnit
      ).toFixed(displayUnit === 'ml' ? 0 : 2);

      return t('foodDiary.waterIntake.perDrink', {
        volume: displayVolume,
        unit: displayUnit,
      });
    }

    const displayVolume = convertMlToSelectedUnit(
      250,
      water_display_unit
    ).toFixed(water_display_unit === 'ml' ? 0 : 2);
    return t('foodDiary.waterIntake.defaultPerDrink', {
      volume: displayVolume,
      unit: water_display_unit,
    });
  };

  const { timezone } = usePreferences();

  const formatLogTime = (timestamp: string) => {
    try {
      const { hour, minute } = instantHourMinute(timestamp, timezone);
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } catch {
      return '--:--';
    }
  };

  const getTimeInputValue = (timestamp: string) => {
    try {
      const { hour, minute } = instantHourMinute(timestamp, timezone);
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } catch {
      return '12:00';
    }
  };

  const handleTimeChange = (
    entryId: string,
    entryDate: string,
    newTime: string
  ) => {
    try {
      // entryDate is a Postgres DATE column serialized as UTC midnight
      // (e.g. "2026-05-14T00:00:00.000Z"). Extract the YYYY-MM-DD substring
      // directly — do NOT use instantToDay, which would roll back to the
      // previous day for users west of UTC.
      const datePart = entryDate.substring(0, 10);
      const timeParts = newTime.split(':');
      const hours = parseInt(timeParts[0] || '0', 10);
      const minutes = parseInt(timeParts[1] || '0', 10);

      // Build a UTC instant from the user's local day + time using dayToUtcRange
      // dayToUtcRange gives midnight UTC for this day in the user's timezone
      const { start } = dayToUtcRange(datePart, timezone);
      const loggedAt = new Date(
        start.getTime() + hours * 3600000 + minutes * 60000
      ).toISOString();

      updateLogTime({ logId: entryId, loggedAt });
      setEditingTimeId(null);
    } catch (e) {
      console.error('Error formatting time:', e);
      setEditingTimeId(null);
    }
  };

  if (!user) {
    return null;
  }

  const fillPercentage = Math.min((waterMl / waterGoalMl) * 100, 100);
  // A container's unit qualifies its own volume. A linked container has none
  // -- volume is 0 and the credit comes from the food -- so whatever unit was
  // left in the form when it was created is vestigial, and letting it drive the
  // card put the day's total in oz for a container the user thinks of as ml.
  const containerUnitIsMeaningful =
    !!currentContainer &&
    (!currentContainer.linked_food_id || currentContainer.volume > 0);
  const displayUnit = containerUnitIsMeaningful
    ? currentContainer.unit
    : water_display_unit;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center text-base dark:text-slate-300">
          <Droplet className="w-4 h-4 mr-2" />
          {t('foodDiary.waterIntake.title', 'Water Intake')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between p-3 dark:text-slate-300">
        {/* Water count display */}
        <div className="text-center mb-3">
          <div className="text-xl font-bold">
            {(() => {
              const activeUnit = currentContainer?.unit || water_display_unit;
              const val = convertMlToSelectedUnit(waterMl, activeUnit);
              const goalVal = convertMlToSelectedUnit(waterGoalMl, activeUnit);
              const decimals =
                activeUnit === 'oz' ? 1 : activeUnit === 'liter' ? 2 : 0;
              return `${parseFloat(val.toFixed(decimals))} / ${parseFloat(goalVal.toFixed(decimals))}`;
            })()}
          </div>
          <div className="text-gray-500 text-xs">
            {currentContainer?.unit || water_display_unit}
          </div>
          {foodWaterMl > 0 && (
            <div className="text-muted-foreground text-xs mt-0.5">
              {(() => {
                const activeUnit = currentContainer?.unit || water_display_unit;
                const decimals =
                  activeUnit === 'oz' ? 1 : activeUnit === 'liter' ? 2 : 0;
                const val = convertMlToSelectedUnit(foodWaterMl, activeUnit);
                return t('foodDiary.waterIntake.fromFood', {
                  volume: parseFloat(val.toFixed(decimals)),
                  unit: activeUnit,
                });
              })()}
            </div>
          )}
        </div>

        {/* Water Bottle Visualization - takes up most space */}
        <div className="flex-1 flex flex-col items-center justify-center mb-3">
          <div className="relative flex flex-col items-center">
            {/* Bottle Cap */}
            <div className="w-5 h-1.5 bg-blue-400 rounded-t-sm mb-0.5"></div>

            {/* Bottle Neck */}
            <div className="w-7 h-5 bg-gray-100 dark:bg-slate-200 border-2 border-blue-400 rounded-sm mb-0.5"></div>

            {/* Main Bottle Body */}
            <div className="relative w-16 h-32 border-3 dark:bg-slate-300 border-blue-400 rounded-xl bg-gray-50 overflow-hidden">
              {/* Water Fill */}
              <div
                className="absolute bottom-0 w-full bg-gradient-to-t from-blue-500 via-blue-400 to-blue-300 transition-all duration-700 ease-out rounded-b-xl"
                style={{ height: `${fillPercentage}%` }}
              >
                {/* Water Surface Ripple Effect */}
                {fillPercentage > 0 && (
                  <div className="absolute top-0 w-full h-0.5 bg-blue-200 opacity-60 animate-pulse"></div>
                )}
              </div>

              {/* Bottle Highlight */}
              <div className="absolute top-3 left-2 w-2.5 h-10 bg-white opacity-30 rounded-full"></div>

              {/* Water Level Lines */}
              <div className="absolute inset-0 flex flex-col justify-between p-0.5">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="w-full h-px bg-blue-200 opacity-40"
                  ></div>
                ))}
              </div>
            </div>

            {/* Progress Percentage */}
            <div className="text-xs text-gray-600 mt-1.5 font-medium">
              {Math.round(fillPercentage)}%
            </div>
          </div>
        </div>

        {/* Intuitive Water Controls: [ - ] VOLUME [ + ] */}
        <div className="flex items-center justify-center space-x-3">
          <Button
            variant="outline"
            onClick={() => adjustWater(-1)}
            disabled={manualWaterMl <= 0 || loading}
            size="icon"
            className="h-8 w-8 rounded-full"
            title={
              manualWaterMl <= 0 && waterMl > 0
                ? t(
                    'foodDiary.waterIntake.noManualToRemove',
                    'Only manually logged water can be removed here'
                  )
                : undefined
            }
          >
            <Minus className="h-4 w-4" />
          </Button>

          <div className="text-center min-w-[70px]">
            <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
              {getVolumeDisplay()}
            </div>
          </div>

          <Button
            onClick={() => adjustWater(1)}
            disabled={loading}
            size="icon"
            className="h-8 w-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Container Toggle (Source) */}
        <div className="flex items-center justify-center mt-3 pt-2 border-t border-gray-100 dark:border-slate-800 space-x-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => cycleContainer('prev')}
            disabled={standardContainers.length <= 1}
            className="h-6 w-6 text-gray-400 hover:text-gray-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center justify-center space-x-1 px-1">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest truncate max-w-[110px]">
              {currentContainer?.name ||
                t('foodDiary.waterIntake.defaultContainer', 'Container')}
            </div>
            {currentContainer?.linked_food_id && (
              <span
                title={t(
                  'foodDiary.waterIntake.linkedDrink',
                  'Linked to a food entry'
                )}
                className="inline-flex items-center"
              >
                <Utensils className="w-2.5 h-2.5 text-blue-500 shrink-0" />
              </span>
            )}
            {currentContainer?.is_primary && (
              <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => cycleContainer('next')}
            disabled={standardContainers.length <= 1}
            className="h-6 w-6 text-gray-400 hover:text-gray-600"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick-Add Drink Presets */}
        {quickAddPresets.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-100 dark:border-slate-800">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
              {t('drink_presets.quickAdd', 'Quick-Add Drinks')}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {quickAddPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => saveWaterIntake(1, preset.id)}
                  disabled={loading}
                  className="flex items-center justify-between p-1.5 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:bg-blue-50/50 dark:hover:bg-slate-700/50 text-left transition-colors cursor-pointer group"
                >
                  <div className="min-w-0 pr-1">
                    <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                      {preset.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      {/* A preset is linked to a food and carries volume 0,
                          so describe the press by what it logs. */}
                      <span>
                        {describeContainerPress(preset, { nonMlDecimals: 1 })}
                      </span>
                      {preset.hydration_factor === 0 && (
                        <span className="text-[9px] text-amber-600 dark:text-amber-400 font-mono">
                          0% water
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 h-5 w-5 rounded-full bg-blue-50 dark:bg-blue-950/60 group-hover:bg-blue-600 group-hover:text-white text-blue-600 dark:text-blue-400 flex items-center justify-center transition-colors">
                    <Plus className="h-3 w-3" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Drink History Log */}
        {logEntries.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-100 dark:border-slate-800">
            <button
              onClick={() => setShowLog(!showLog)}
              className="flex items-center justify-between w-full text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <span>
                {t('foodDiary.waterIntake.logTitle', "Today's drinks")} (
                {logEntries.length})
              </span>
              {showLog ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showLog && (
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                {logEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between py-1 px-1.5 rounded text-xs bg-gray-50 dark:bg-slate-800/50 group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {editingTimeId === entry.id ? (
                        <input
                          type="time"
                          className="text-xs tabular-nums bg-white dark:bg-slate-700 border border-blue-300 dark:border-blue-600 rounded px-1 py-0.5 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400 w-[72px]"
                          defaultValue={getTimeInputValue(
                            entry.logged_at || entry.created_at
                          )}
                          onBlur={(e) =>
                            handleTimeChange(
                              entry.id,
                              entry.entry_date,
                              e.target.value
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleTimeChange(
                                entry.id,
                                entry.entry_date,
                                (e.target as HTMLInputElement).value
                              );
                            } else if (e.key === 'Escape') {
                              setEditingTimeId(null);
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <button
                          onClick={() => setEditingTimeId(entry.id)}
                          className="text-gray-400 dark:text-gray-500 tabular-nums shrink-0 hover:text-blue-500 dark:hover:text-blue-400 hover:underline cursor-pointer transition-colors"
                          title={t(
                            'foodDiary.waterIntake.editTime',
                            'Click to change time'
                          )}
                        >
                          {formatLogTime(entry.logged_at || entry.created_at)}
                        </button>
                      )}
                      <span className="text-gray-600 dark:text-gray-300 truncate">
                        {entry.container_name ||
                          t(
                            'foodDiary.waterIntake.defaultContainer',
                            'Container'
                          )}
                      </span>
                      {entry.food_entry_id && (
                        <span
                          title={t(
                            'foodDiary.waterIntake.linkedDrink',
                            'Linked to a food entry'
                          )}
                          className="inline-flex items-center"
                        >
                          <Utensils className="w-3 h-3 text-blue-500 shrink-0" />
                        </span>
                      )}
                      {/* Synced entries are labelled so it's clear why the "-"
                          control can't remove them; manual rows stay unlabelled
                          to keep the common case uncluttered. */}
                      {!isManualSource(entry.source) && (
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300">
                          {prettifySource(entry.source)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* A drink with a hydration factor of 0 -- an espresso,
                          a spirit -- credits no water on purpose. Printing a
                          bare "0 ml" beside it read as a failed calculation
                          rather than the intended answer. */}
                      {Number(entry.water_ml) === 0 ? (
                        <span
                          className="font-medium text-muted-foreground"
                          title={t(
                            'foodDiary.waterIntake.noWaterCreditHint',
                            'This drink is set to count as no water'
                          )}
                        >
                          {t('foodDiary.waterIntake.noWaterCredit', 'no water')}
                        </span>
                      ) : (
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {(() => {
                            const val = convertMlToSelectedUnit(
                              Number(entry.water_ml),
                              displayUnit
                            );
                            const decimals =
                              displayUnit === 'oz'
                                ? 1
                                : displayUnit === 'liter'
                                  ? 2
                                  : 0;
                            return parseFloat(val.toFixed(decimals));
                          })()}{' '}
                          {displayUnit}
                        </span>
                      )}
                      {/* Provider-synced rows get no delete: the provider still
                          holds the record, so a deleted row just re-inserts on
                          the next sync. */}
                      {isManualSource(entry.source) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => deleteLogEntry(entry.id)}
                          disabled={deleting}
                          title={t(
                            'foodDiary.waterIntake.deleteEntry',
                            'Delete this drink'
                          )}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WaterIntake;
