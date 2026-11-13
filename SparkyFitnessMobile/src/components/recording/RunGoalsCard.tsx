import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  type GetRunGoalsResponse,
  type UpsertRunGoalsBody,
} from '@workspace/shared';
import Button from '../ui/Button';
import CalendarSheet, { type CalendarSheetRef } from '../CalendarSheet';
import FormInput from '../FormInput';
import { formatLocalizedNumber } from '../../localization';
import { formatDayLabel } from '../../utils/dayLabel';
import { parseDecimalInput } from '../../utils/numericInput';
import { distanceFromKm, distanceToKm } from '../../utils/unitConversions';

type DistanceUnit = 'km' | 'miles';

/** A distance in the display unit rounded to at most one decimal. */
const rounded = (km: number, unit: DistanceUnit): number =>
  Math.round(distanceFromKm(km, unit) * 10) / 10;

/** Display text for a distance, in the app's number format ("12,5" in some locales). */
const shown = (km: number, unit: DistanceUnit): string =>
  formatLocalizedNumber(rounded(km, unit));

/** Text for a distance field: empty for none; plain digits so it stays parseable. */
const fieldValue = (km: number | null, unit: DistanceUnit): string =>
  km === null ? '' : String(rounded(km, unit));

/** An empty field clears the value (null); anything unreadable or not above zero is undefined. */
function readDistanceKm(
  text: string,
  unit: DistanceUnit
): number | null | undefined {
  if (text.trim() === '') return null;
  const value = parseDecimalInput(text);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  // The server stores 0.1 km for the target and 0.01 km for the race.
  const km = Math.round(distanceToKm(value, unit) * 100) / 100;
  return km > 0 && km <= 1000 ? km : undefined;
}

/**
 * The person's weekly running distance target and the race they are counting
 * down to, with this week's progress. Editing is in place; the card only shows
 * what the server computed (`progress`), so the week and the race countdown
 * follow the person's own calendar.
 */
const RunGoalsCard: React.FC<{
  data: GetRunGoalsResponse;
  distanceUnit: DistanceUnit;
  /** Today, YYYY-MM-DD, for the race date picker. */
  today: string;
  saving?: boolean;
  /** Rejects when the goals could not be saved. */
  onSave: (body: UpsertRunGoalsBody) => Promise<void>;
}> = ({ data, distanceUnit, today, saving = false, onSave }) => {
  const { t } = useTranslation();
  const { goals, progress } = data;
  const [editing, setEditing] = useState(false);
  const [weekly, setWeekly] = useState('');
  const [raceName, setRaceName] = useState('');
  const [raceDistance, setRaceDistance] = useState('');
  const [raceDate, setRaceDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const calendarRef = useRef<CalendarSheetRef>(null);

  const unitLabel =
    distanceUnit === 'miles'
      ? t('runPrograms.goals.unit.miles', { defaultValue: 'mi' })
      : t('runPrograms.goals.unit.km', { defaultValue: 'km' });

  const startEditing = () => {
    setWeekly(fieldValue(goals?.weekly_distance_km ?? null, distanceUnit));
    setRaceName(goals?.race_name ?? '');
    setRaceDistance(fieldValue(goals?.race_distance_km ?? null, distanceUnit));
    setRaceDate(goals?.race_date ?? null);
    setError(null);
    setEditing(true);
  };

  // A name or distance means nothing without the day, so all three go.
  const clearRace = () => {
    setRaceDate(null);
    setRaceName('');
    setRaceDistance('');
  };

  const submit = async () => {
    const weeklyKm = readDistanceKm(weekly, distanceUnit);
    const raceKm = readDistanceKm(raceDistance, distanceUnit);
    if (weeklyKm === undefined || raceKm === undefined) {
      setError(
        t('runPrograms.goals.errors.distance', {
          defaultValue: 'Enter a distance above zero, or leave it empty.',
        })
      );
      return;
    }
    const name = raceName.trim();
    if (raceDate === null && (name !== '' || raceKm !== null)) {
      setError(
        t('runPrograms.goals.errors.raceDay', {
          defaultValue:
            'Pick the race day, or clear the race name and distance.',
        })
      );
      return;
    }
    setError(null);
    try {
      await onSave({
        weekly_distance_km: weeklyKm,
        race_name: raceDate === null || name === '' ? null : name,
        race_date: raceDate,
        race_distance_km: raceDate === null ? null : raceKm,
      });
      setEditing(false);
    } catch {
      setError(
        t('runPrograms.goals.errors.save', {
          defaultValue: 'Could not save your goals. Please try again.',
        })
      );
    }
  };

  const title = (
    <Text className="text-text-primary text-base font-semibold">
      {t('runPrograms.goals.title', { defaultValue: 'Running goals' })}
    </Text>
  );

  if (editing) {
    return (
      <View className="bg-surface rounded-xl p-4 mb-4" testID="run-goals-form">
        {title}
        <Text className="text-text-secondary text-xs mt-3 mb-1">
          {t('runPrograms.goals.weeklyLabel', {
            unit: unitLabel,
            defaultValue: 'Weekly distance ({{unit}})',
          })}
        </Text>
        <FormInput
          value={weekly}
          onChangeText={setWeekly}
          keyboardType="decimal-pad"
          placeholder={t('runPrograms.goals.none', { defaultValue: 'None' })}
          accessibilityLabel={t('runPrograms.goals.weeklyLabel', {
            unit: unitLabel,
            defaultValue: 'Weekly distance ({{unit}})',
          })}
        />
        <Text className="text-text-secondary text-xs mt-3 mb-1">
          {t('runPrograms.goals.raceNameLabel', {
            defaultValue: 'Race name',
          })}
        </Text>
        <FormInput
          value={raceName}
          onChangeText={setRaceName}
          maxLength={100}
          placeholder={t('runPrograms.goals.raceDefaultName', {
            defaultValue: 'Race day',
          })}
          accessibilityLabel={t('runPrograms.goals.raceNameLabel', {
            defaultValue: 'Race name',
          })}
        />
        <Text className="text-text-secondary text-xs mt-3 mb-1">
          {t('runPrograms.goals.raceDistanceLabel', {
            unit: unitLabel,
            defaultValue: 'Race distance ({{unit}})',
          })}
        </Text>
        <FormInput
          value={raceDistance}
          onChangeText={setRaceDistance}
          keyboardType="decimal-pad"
          placeholder={t('runPrograms.goals.none', { defaultValue: 'None' })}
          accessibilityLabel={t('runPrograms.goals.raceDistanceLabel', {
            unit: unitLabel,
            defaultValue: 'Race distance ({{unit}})',
          })}
        />
        <Text className="text-text-secondary text-xs mt-3 mb-1">
          {t('runPrograms.goals.raceDateLabel', { defaultValue: 'Race day' })}
        </Text>
        <View className="flex-row items-center">
          <Button
            variant="outline"
            onPress={() => calendarRef.current?.present()}
          >
            {raceDate
              ? formatDayLabel(raceDate, 'short')
              : t('runPrograms.goals.pickDate', {
                  defaultValue: 'Pick a date',
                })}
          </Button>
          {raceDate ? (
            <Pressable
              className="ml-3 py-2"
              accessibilityRole="button"
              onPress={clearRace}
            >
              <Text className="text-accent-primary text-sm">
                {t('runPrograms.goals.clearRace', {
                  defaultValue: 'Remove race',
                })}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {error ? (
          <Text
            className="text-bg-danger text-sm mt-3"
            accessibilityRole="alert"
          >
            {error}
          </Text>
        ) : null}
        <View className="flex-row mt-4 gap-3">
          <View className="flex-1">
            <Button
              variant="outline"
              onPress={() => setEditing(false)}
              disabled={saving}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </View>
          <View className="flex-1">
            <Button
              variant="primary"
              onPress={() => void submit()}
              loading={saving}
            >
              {t('common.save', { defaultValue: 'Save' })}
            </Button>
          </View>
        </View>
        <CalendarSheet
          ref={calendarRef}
          selectedDate={raceDate ?? today}
          onSelectDate={setRaceDate}
        />
      </View>
    );
  }

  const target = goals?.weekly_distance_km ?? null;
  const percent = progress.weekly_percent;
  const raceDaysLeft = progress.race_days_left;

  if (!goals || (target === null && raceDaysLeft === null)) {
    return (
      <View className="bg-surface rounded-xl p-4 mb-4" testID="run-goals-empty">
        {title}
        <Text className="text-text-secondary text-sm mt-1">
          {t('runPrograms.goals.intro', {
            defaultValue:
              'Set a weekly distance to aim for and a race to count down to.',
          })}
        </Text>
        <View className="mt-3">
          <Button variant="outline" onPress={startEditing}>
            {t('runPrograms.goals.set', { defaultValue: 'Set a goal' })}
          </Button>
        </View>
      </View>
    );
  }

  const raceName_ =
    goals.race_name ??
    t('runPrograms.goals.raceDefaultName', { defaultValue: 'Race day' });
  const raceLine =
    raceDaysLeft === null
      ? null
      : raceDaysLeft === 0
        ? t('runPrograms.goals.raceToday', {
            defaultValue: 'Race day is today',
          })
        : raceDaysLeft > 0
          ? t('runPrograms.goals.raceIn', {
              count: raceDaysLeft,
              defaultValue: '{{count}} days to go',
              defaultValue_one: '{{count}} day to go',
              defaultValue_other: '{{count}} days to go',
            })
          : t('runPrograms.goals.racePast', {
              count: -raceDaysLeft,
              defaultValue: '{{count}} days ago',
              defaultValue_one: '{{count}} day ago',
              defaultValue_other: '{{count}} days ago',
            });

  return (
    <View className="bg-surface rounded-xl p-4 mb-4" testID="run-goals-card">
      <View className="flex-row items-center justify-between">
        {title}
        <Pressable
          accessibilityRole="button"
          onPress={startEditing}
          hitSlop={8}
        >
          <Text className="text-accent-primary text-sm">
            {t('runPrograms.goals.edit', { defaultValue: 'Edit' })}
          </Text>
        </Pressable>
      </View>

      {target !== null && percent !== null ? (
        <View className="mt-3" testID="run-goals-weekly">
          <Text className="text-text-primary text-sm">
            {t('runPrograms.goals.weeklyProgress', {
              done: shown(progress.week_distance_km, distanceUnit),
              target: shown(target, distanceUnit),
              unit: unitLabel,
              defaultValue: '{{done}} of {{target}} {{unit}} this week',
            })}
          </Text>
          <View className="h-2 rounded-full bg-progress-track mt-2 overflow-hidden">
            <View
              className="h-2 rounded-full bg-accent-primary"
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </View>
          <Text className="text-text-muted text-xs mt-1">
            {progress.daily_needed_km === null
              ? t('runPrograms.goals.weeklyReached', {
                  defaultValue: 'Weekly goal reached',
                })
              : t('runPrograms.goals.weeklyNeeded', {
                  amount: shown(progress.daily_needed_km, distanceUnit),
                  unit: unitLabel,
                  count: progress.days_left_in_week,
                  defaultValue:
                    'About {{amount}} {{unit}} a day to reach it ({{count}} days left)',
                  defaultValue_one:
                    '{{amount}} {{unit}} today to reach it ({{count}} day left)',
                  defaultValue_other:
                    'About {{amount}} {{unit}} a day to reach it ({{count}} days left)',
                })}
          </Text>
        </View>
      ) : null}

      {raceLine !== null ? (
        <View className="mt-3" testID="run-goals-race">
          <Text className="text-text-primary text-sm font-semibold">
            {raceName_}
            {goals.race_distance_km !== null
              ? ` · ${shown(goals.race_distance_km, distanceUnit)} ${unitLabel}`
              : ''}
          </Text>
          <Text className="text-text-secondary text-sm">
            {raceLine}
            {goals.race_date
              ? ` · ${formatDayLabel(goals.race_date, 'short')}`
              : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

export default RunGoalsCard;
