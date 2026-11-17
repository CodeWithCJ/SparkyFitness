import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import Icon, { type IconName } from './Icon';
import { formatLocalizedNumber } from '../localization';
import { distanceFromKm, weightFromKg } from '../utils/unitConversions';
import {
  formatDuration,
  getRpeTone,
  type WorkoutHeartRateSummary,
} from '../utils/workoutSession';
import { RPE_TONE_VARS } from './ActiveWorkoutSetRow';
import { energyUnitLabel, formatEnergyNumber } from '../utils/energyUnit';
import { useEnergyUnit } from '../hooks/useEnergyUnit';

interface WorkoutCompleteStatTilesProps {
  durationMinutes: number;
  volumeKg: number;
  completedSetCount: number;
  totalSetCount: number;
  skippedSetCount: number;
  caloriesValue: number | null;
  caloriesFailed: boolean;
  heartRate: WorkoutHeartRateSummary | null;
  totalDistanceKm: number;
  averageRpe: number | null;
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'miles';
}

function StatTile({
  icon,
  iconColor,
  label,
  children,
}: {
  icon: IconName;
  // Tinted only for the physiological metrics (calories, heart rate), matching
  // WorkoutDetailScreen's summary row; structural stats stay muted.
  iconColor?: string;
  label: string;
  children: ReactNode;
}) {
  const textMuted = String(useCSSVariable('--color-text-muted'));
  return (
    <View className="flex-1 bg-surface rounded-xl shadow-sm px-3.5 py-3">
      <View className="flex-row items-center gap-1">
        <Icon name={icon} size={12} color={iconColor ?? textMuted} />
        <Text
          className="text-xs font-semibold uppercase text-text-muted"
          style={{ letterSpacing: 0.6 }}
        >
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

function StatValue({ value, unit }: { value: string; unit?: string }) {
  return (
    <Text
      className="text-xl font-bold text-text-primary mt-0.5"
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {value}
      {unit != null && (
        <Text className="text-sm font-semibold text-text-secondary">
          {' '}
          {unit}
        </Text>
      )}
    </Text>
  );
}

function CaloriesShimmer() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: 650 }),
        withTiming(1, { duration: 650 })
      ),
      -1
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reducedMotion]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={animatedStyle}
      accessibilityLabel={t('workoutComplete.accessibility.calculating', {
        defaultValue: 'Calculating',
      })}
    >
      <View
        className="bg-raised rounded-md mt-1"
        style={{ width: 58, height: 20 }}
      />
    </Animated.View>
  );
}

export default function WorkoutCompleteStatTiles({
  durationMinutes,
  volumeKg,
  completedSetCount,
  totalSetCount,
  skippedSetCount,
  caloriesValue,
  caloriesFailed,
  heartRate,
  totalDistanceKm,
  averageRpe,
  weightUnit,
  distanceUnit,
}: WorkoutCompleteStatTilesProps) {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const rpeTone = averageRpe != null ? getRpeTone(averageRpe) : null;
  const rpeToneColor = String(useCSSVariable(RPE_TONE_VARS[rpeTone ?? 'easy']));
  const [heartRateColor, activeEnergyColor] = useCSSVariable([
    '--color-heart-rate',
    '--color-active-energy',
  ]) as [string, string];

  return (
    <>
      <View className="flex-row gap-2">
        <StatTile
          icon="timer"
          label={t('workoutComplete.stats.duration', {
            defaultValue: 'Duration',
          })}
        >
          <StatValue
            value={durationMinutes > 0 ? formatDuration(durationMinutes) : '—'}
          />
        </StatTile>
        <StatTile
          icon="exercise-weights"
          label={t('workoutComplete.stats.volume', {
            defaultValue: 'Volume',
          })}
        >
          {volumeKg > 0 ? (
            <StatValue
              value={formatLocalizedNumber(
                Math.round(weightFromKg(volumeKg, weightUnit))
              )}
              unit={weightUnit}
            />
          ) : (
            <StatValue value="—" />
          )}
        </StatTile>
      </View>
      <View className="flex-row gap-2 mt-2">
        <StatTile
          icon="checkmark-circle"
          label={t('workoutComplete.stats.sets', { defaultValue: 'Sets' })}
        >
          <Text
            className="text-xl font-bold text-text-primary mt-0.5"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {completedSetCount}
            <Text className="text-sm font-semibold text-text-secondary">
              {' '}
              / {totalSetCount}
              {skippedSetCount > 0 && (
                <>
                  {' '}
                  · {skippedSetCount}{' '}
                  {t('workoutComplete.labels.skipped', {
                    defaultValue: 'skipped',
                  })}
                </>
              )}
            </Text>
          </Text>
        </StatTile>
        <StatTile
          icon="flame"
          iconColor={activeEnergyColor}
          label={t('workoutComplete.stats.calories', {
            defaultValue: 'Calories',
          })}
        >
          {caloriesValue != null ? (
            <StatValue
              value={formatEnergyNumber(caloriesValue, energyUnit)}
              unit={energyUnitLabel(energyUnit, t)}
            />
          ) : caloriesFailed ? (
            <StatValue value="—" />
          ) : (
            <CaloriesShimmer />
          )}
        </StatTile>
      </View>

      {heartRate && (
        <View className="flex-row gap-2 mt-2">
          <StatTile
            icon="heart-rate"
            iconColor={heartRateColor}
            label={t('workoutComplete.stats.avgHeartRate', {
              defaultValue: 'Avg HR',
            })}
          >
            <StatValue
              value={formatLocalizedNumber(Math.round(heartRate.avgBpm))}
              unit={t('workoutComplete.units.bpm', { defaultValue: 'bpm' })}
            />
          </StatTile>
          {heartRate.maxBpm != null && (
            <StatTile
              icon="heart-rate"
              iconColor={heartRateColor}
              label={t('workoutComplete.stats.maxHeartRate', {
                defaultValue: 'Max HR',
              })}
            >
              <StatValue
                value={formatLocalizedNumber(Math.round(heartRate.maxBpm))}
                unit={t('workoutComplete.units.bpm', {
                  defaultValue: 'bpm',
                })}
              />
            </StatTile>
          )}
        </View>
      )}

      {totalDistanceKm > 0 && (
        <View className="flex-row gap-2 mt-2">
          <StatTile
            icon="exercise-running"
            label={t('workoutComplete.stats.distance', {
              defaultValue: 'Distance',
            })}
          >
            <StatValue
              value={formatLocalizedNumber(
                distanceFromKm(totalDistanceKm, distanceUnit),
                { maximumFractionDigits: 2 }
              )}
              unit={distanceUnit === 'miles' ? 'mi' : 'km'}
            />
          </StatTile>
        </View>
      )}

      {averageRpe != null && rpeTone != null && (
        <View className="flex-row items-center bg-surface rounded-xl shadow-sm px-3.5 py-3 mt-2">
          <Text
            className="text-xs font-semibold uppercase text-text-muted"
            style={{ letterSpacing: 0.6 }}
          >
            {t('workoutComplete.stats.averageRpe', {
              defaultValue: 'Average RPE',
            })}
          </Text>
          <Text
            className="text-xs font-semibold ml-auto"
            style={{ color: rpeToneColor }}
          >
            {
              {
                easy: t('workoutComplete.rpe.easy', {
                  defaultValue: 'Easy',
                }),
                moderate: t('workoutComplete.rpe.moderate', {
                  defaultValue: 'Moderate',
                }),
                hard: t('workoutComplete.rpe.hard', {
                  defaultValue: 'Hard',
                }),
                max: t('workoutComplete.rpe.max', {
                  defaultValue: 'Max effort',
                }),
              }[rpeTone]
            }
          </Text>
          <Text
            className="text-base font-bold ml-2"
            style={{ color: rpeToneColor, fontVariant: ['tabular-nums'] }}
          >
            {formatLocalizedNumber(averageRpe, {
              maximumFractionDigits: 1,
            })}
          </Text>
        </View>
      )}
    </>
  );
}
