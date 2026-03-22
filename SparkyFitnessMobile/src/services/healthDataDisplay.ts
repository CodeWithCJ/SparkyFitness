import {
  getSyncStartDate,
  readHealthRecords,
  getAggregatedStepsByDate,
  getAggregatedActiveCaloriesByDate,
  getAggregatedTotalCaloriesByDate,
  getAggregatedDistanceByDate,
  getAggregatedFloorsClimbedByDate,
} from './healthConnectService';
import { HEALTH_METRICS } from '../HealthMetrics';
import { addLog } from './LogService';
import type { HealthDataDisplayState } from '../types/healthRecords';
import type { TimeRange } from './storage';

export const NO_DATA_DISPLAY = 'No data';

/**
 * Fetches health data from the device for all metrics and formats display values.
 * Returns a map of metric ID to formatted string (e.g., "5,432" for steps, "72 bpm" for heart rate).
 */
export async function fetchHealthDisplayData(
  timeRange: TimeRange
): Promise<HealthDataDisplayState> {
  const endDate = new Date();
  const startDate = getSyncStartDate(timeRange);
  const result: HealthDataDisplayState = {};

  for (const metric of HEALTH_METRICS) {
    let records: unknown[] = [];
    let displayValue = 'N/A';

    try {
      // Path A: Aggregated metrics (cumulative data that needs dedup)
      if (metric.recordType === 'Steps') {
        const aggregatedSteps = await getAggregatedStepsByDate(startDate, endDate);
        const totalSteps = aggregatedSteps.reduce((sum, record) => sum + record.value, 0);
        result[metric.id] = totalSteps.toLocaleString();
        continue;
      }

      if (metric.recordType === 'ActiveCaloriesBurned') {
        const aggregatedCalories = await getAggregatedActiveCaloriesByDate(startDate, endDate);
        const totalCalories = aggregatedCalories.reduce((sum, record) => sum + record.value, 0);
        result[metric.id] = totalCalories.toLocaleString();
        continue;
      }

      if (metric.recordType === 'TotalCaloriesBurned') {
        const aggregatedTotalCalories = await getAggregatedTotalCaloriesByDate(startDate, endDate);
        const totalCaloriesSum = aggregatedTotalCalories.reduce((sum, record) => sum + record.value, 0);
        result[metric.id] = totalCaloriesSum.toLocaleString();
        continue;
      }

      if (metric.recordType === 'Distance') {
        const aggregatedDistance = await getAggregatedDistanceByDate(startDate, endDate);
        const totalMeters = aggregatedDistance.reduce((sum, record) => sum + record.value, 0);
        result[metric.id] = `${(totalMeters / 1000).toFixed(2)} km`;
        continue;
      }

      if (metric.recordType === 'FloorsClimbed') {
        const aggregatedFloors = await getAggregatedFloorsClimbedByDate(startDate, endDate);
        const totalFloors = Math.round(aggregatedFloors.reduce((sum, record) => sum + record.value, 0));
        result[metric.id] = totalFloors.toLocaleString();
        continue;
      }

      // Path B: Raw record metrics
      records = await readHealthRecords(metric.recordType, startDate, endDate) as unknown[];

      if (records.length === 0) {
        result[metric.id] = NO_DATA_DISPLAY;
        continue;
      }

      switch (metric.recordType) {

        case 'HeartRate': {
          const hrRecords = records as { samples?: { beatsPerMinute: number }[] }[];
          const bpmValues = hrRecords
            .flatMap(r => r.samples ?? [])
            .map(s => s.beatsPerMinute)
            .filter((v): v is number => v != null && !isNaN(v));
          const avgHeartRate = bpmValues.length > 0
            ? Math.round(bpmValues.reduce((sum, v) => sum + v, 0) / bpmValues.length)
            : 0;
          displayValue = avgHeartRate > 0 ? `${avgHeartRate} bpm` : NO_DATA_DISPLAY;
          break;
        }

        case 'Weight': {
          const latestWeight = (records as { time: string; weight?: { inKilograms: number } }[]).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
          displayValue = latestWeight.weight?.inKilograms
            ? `${latestWeight.weight.inKilograms.toFixed(1)} kg`
            : NO_DATA_DISPLAY;
          break;
        }

        case 'BodyFat': {
          const extractBodyFatValue = (record: unknown): number | null => {
            const r = record as Record<string, unknown>;
            const percentage = r.percentage as Record<string, unknown> | number | undefined;
            const bodyFatPercentage = r.bodyFatPercentage as Record<string, unknown> | undefined;

            if (typeof percentage === 'object' && percentage !== null && 'inPercent' in percentage) {
              return percentage.inPercent as number;
            }
            if (typeof bodyFatPercentage === 'object' && bodyFatPercentage !== null && 'inPercent' in bodyFatPercentage) {
              return bodyFatPercentage.inPercent as number;
            }
            if (typeof percentage === 'object' && percentage !== null && 'value' in percentage) {
              return percentage.value as number;
            }
            if (typeof percentage === 'number') {
              return percentage;
            }
            if (typeof r.value === 'number') {
              return r.value;
            }
            if (typeof r.bodyFat === 'number') {
              return r.bodyFat;
            }
            return null;
          };

          const getRecordDate = (record: unknown): string | null => {
            const r = record as Record<string, unknown>;
            if (r.time) return r.time as string;
            if (r.startTime) return r.startTime as string;
            if (r.timestamp) return r.timestamp as string;
            if (r.date) return r.date as string;
            return null;
          };

          const validBodyFat = records
            .map(r => ({
              date: getRecordDate(r),
              value: extractBodyFatValue(r),
            }))
            .filter(r => r.date && r.value !== null && !isNaN(r.value))
            .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

          if (validBodyFat.length > 0) {
            const latestValue = validBodyFat[0].value!;
            displayValue = `${latestValue.toFixed(1)}%`;
          } else {
            displayValue = NO_DATA_DISPLAY;
          }
          break;
        }

        case 'BloodPressure': {
          const latestBP = (records as { time: string; systolic?: { inMillimetersOfMercury: number }; diastolic?: { inMillimetersOfMercury: number } }[]).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
          const systolic = latestBP.systolic?.inMillimetersOfMercury;
          const diastolic = latestBP.diastolic?.inMillimetersOfMercury;
          displayValue = (systolic && diastolic)
            ? `${Math.round(systolic)}/${Math.round(diastolic)} mmHg`
            : NO_DATA_DISPLAY;
          break;
        }

        case 'SleepSession': {
          const totalSleepMinutes = (records as { startTime: string; endTime: string }[]).reduce((sum, record) => {
            const duration = (new Date(record.endTime).getTime() - new Date(record.startTime).getTime()) / (1000 * 60);
            return sum + duration;
          }, 0);
          if (totalSleepMinutes === 0) {
            displayValue = NO_DATA_DISPLAY;
          } else {
            const hours = Math.floor(totalSleepMinutes / 60);
            const minutes = Math.round(totalSleepMinutes % 60);
            displayValue = `${hours}h ${minutes}m`;
          }
          break;
        }

        case 'Hydration': {
          const totalHydration = (records as { volume?: { inLiters: number } }[]).reduce((sum, record) =>
            sum + (record.volume?.inLiters || 0), 0);
          displayValue = totalHydration === 0 ? NO_DATA_DISPLAY : `${totalHydration.toFixed(2)} L`;
          break;
        }

        case 'Height': {
          const latestHeight = (records as { time: string; height?: { inMeters: number } }[]).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
          displayValue = latestHeight.height?.inMeters
            ? `${(latestHeight.height.inMeters * 100).toFixed(1)} cm`
            : NO_DATA_DISPLAY;
          break;
        }

        case 'BasalBodyTemperature':
        case 'BodyTemperature': {
          const latestTemp = (records as { time?: string; startTime?: string; temperature?: { inCelsius: number } }[]).sort((a, b) => new Date(b.time || b.startTime || '').getTime() - new Date(a.time || a.startTime || '').getTime())[0];
          displayValue = latestTemp.temperature?.inCelsius
            ? `${latestTemp.temperature.inCelsius.toFixed(1)}°C`
            : NO_DATA_DISPLAY;
          break;
        }

        case 'BloodGlucose': {
          const latestGlucose = (records as { time: string; level?: { inMillimolesPerLiter?: number; inMilligramsPerDeciliter?: number }; bloodGlucose?: { inMillimolesPerLiter?: number; inMilligramsPerDeciliter?: number } }[]).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];
          const glucoseValue = latestGlucose.level?.inMillimolesPerLiter
            || latestGlucose.bloodGlucose?.inMillimolesPerLiter
            || (latestGlucose.level?.inMilligramsPerDeciliter ? latestGlucose.level.inMilligramsPerDeciliter / 18.018 : null)
            || (latestGlucose.bloodGlucose?.inMilligramsPerDeciliter ? latestGlucose.bloodGlucose.inMilligramsPerDeciliter / 18.018 : null);

          displayValue = glucoseValue
            ? `${glucoseValue.toFixed(1)} mmol/L`
            : NO_DATA_DISPLAY;
          break;
        }

        case 'OxygenSaturation': {
          const extractO2Value = (record: unknown): number | null => {
            const r = record as Record<string, unknown>;
            const percentage = r.percentage as Record<string, unknown> | number | undefined;

            if (typeof percentage === 'object' && percentage !== null && 'inPercent' in percentage) {
              return percentage.inPercent as number;
            }
            if (typeof percentage === 'number') {
              return percentage;
            }
            if (typeof r.value === 'number') {
              return r.value;
            }
            if (typeof r.oxygenSaturation === 'number') {
              return r.oxygenSaturation;
            }
            if (typeof r.spo2 === 'number') {
              return r.spo2;
            }
            return null;
          };

          const getO2Date = (record: unknown): string | null => {
            const r = record as Record<string, unknown>;
            return (r.time || r.startTime || r.timestamp || r.date) as string | null;
          };

          const validO2 = records
            .map(r => ({
              date: getO2Date(r),
              value: extractO2Value(r),
            }))
            .filter(r => r.date && r.value !== null && !isNaN(r.value) && r.value > 0 && r.value <= 100)
            .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

          if (validO2.length > 0) {
            displayValue = `${validO2[0].value!.toFixed(1)}%`;
          } else {
            displayValue = NO_DATA_DISPLAY;
          }
          break;
        }

        case 'RestingHeartRate': {
          const avgRestingHR = (records as { beatsPerMinute?: number }[]).reduce((sum, record) =>
            sum + (record.beatsPerMinute || 0), 0) / records.length;
          displayValue = avgRestingHR > 0 ? `${Math.round(avgRestingHR)} bpm` : NO_DATA_DISPLAY;
          break;
        }

        case 'Vo2Max': {
          const extractVo2Value = (record: unknown): number | null => {
            const r = record as Record<string, unknown>;
            if (typeof r.vo2Max === 'number') return r.vo2Max;
            if (typeof r.vo2 === 'number') return r.vo2;
            if (typeof r.value === 'number') return r.value;
            if (typeof r.vo2MillilitersPerMinuteKilogram === 'number') return r.vo2MillilitersPerMinuteKilogram;
            return null;
          };

          const getVo2Date = (record: unknown): string | null => {
            const r = record as Record<string, unknown>;
            return (r.time || r.startTime || r.timestamp || r.date) as string | null;
          };

          const validVo2 = records
            .map(r => ({
              date: getVo2Date(r),
              value: extractVo2Value(r),
            }))
            .filter(r => r.date && r.value !== null && !isNaN(r.value) && r.value > 0 && r.value < 100)
            .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

          if (validVo2.length > 0) {
            displayValue = `${validVo2[0].value!.toFixed(1)} ml/min/kg`;
          } else {
            displayValue = NO_DATA_DISPLAY;
          }
          break;
        }

        case 'LeanBodyMass':
        case 'BoneMass': {
          const latestMass = (records as { startTime?: string; time?: string; mass?: { inKilograms: number } }[]).sort((a, b) => new Date(b.startTime || b.time || '').getTime() - new Date(a.startTime || a.time || '').getTime())[0];
          displayValue = latestMass.mass?.inKilograms
            ? `${latestMass.mass.inKilograms.toFixed(1)} kg`
            : NO_DATA_DISPLAY;
          break;
        }

        case 'BasalMetabolicRate': {
          const extractBMRValue = (record: unknown): number | null => {
            const r = record as Record<string, unknown>;
            const basalMetabolicRate = r.basalMetabolicRate as Record<string, unknown> | number | undefined;

            if (basalMetabolicRate !== undefined) {
              if (typeof basalMetabolicRate === 'number') {
                return basalMetabolicRate;
              } else if (typeof basalMetabolicRate === 'object' && basalMetabolicRate !== null) {
                if ('inKilocaloriesPerDay' in basalMetabolicRate) return basalMetabolicRate.inKilocaloriesPerDay as number;
                if ('inCalories' in basalMetabolicRate) return basalMetabolicRate.inCalories as number;
                if ('inKilocalories' in basalMetabolicRate) return basalMetabolicRate.inKilocalories as number;
                if ('value' in basalMetabolicRate) return basalMetabolicRate.value as number;
              }
            } else {
              const energy = r.energy as Record<string, unknown> | undefined;
              if (energy && 'inCalories' in energy) return energy.inCalories as number;
            }
            return null;
          };

          const getBMRDate = (record: unknown): string | null => {
            const r = record as Record<string, unknown>;
            return (r.time || r.startTime || r.timestamp || r.date) as string | null;
          };

          const dailyBMRs: Record<string, { sum: number; count: number }> = {};
          records.forEach((r) => {
            const date = getBMRDate(r);
            const value = extractBMRValue(r);
            if (date && value !== null && !isNaN(value)) {
              if (!dailyBMRs[date]) {
                dailyBMRs[date] = { sum: 0, count: 0 };
              }
              dailyBMRs[date].sum += value;
              dailyBMRs[date].count++;
            }
          });

          const aggregatedBMR = Object.values(dailyBMRs).map(day => day.sum / day.count);
          const totalAggregatedBMR = aggregatedBMR.reduce((sum, val) => sum + val, 0);

          if (aggregatedBMR.length > 0) {
            const avgBMR = totalAggregatedBMR / aggregatedBMR.length;
            displayValue = `${Math.round(avgBMR)} kcal`;
          } else {
            displayValue = NO_DATA_DISPLAY;
          }
          break;
        }

        case 'WheelchairPushes': {
          const totalPushes = (records as { count?: number }[]).reduce((sum, record) => sum + (record.count || 0), 0);
          displayValue = totalPushes === 0 ? NO_DATA_DISPLAY : totalPushes.toLocaleString();
          break;
        }

        case 'ExerciseSession': {
          const totalExerciseMinutes = (records as { startTime: string; endTime: string }[]).reduce((sum, record) => {
            const duration = (new Date(record.endTime).getTime() - new Date(record.startTime).getTime()) / (1000 * 60);
            return sum + duration;
          }, 0);
          displayValue = totalExerciseMinutes === 0 ? NO_DATA_DISPLAY : `${Math.round(totalExerciseMinutes)} min`;
          break;
        }

        case 'ElevationGained': {
          const totalElevation = (records as { elevation?: { inMeters: number } }[]).reduce((sum, record) =>
            sum + (record.elevation?.inMeters || 0), 0);
          displayValue = totalElevation === 0 ? NO_DATA_DISPLAY : `${Math.round(totalElevation)} m`;
          break;
        }

        case 'Power': {
          const avgPower = (records as { power?: { inWatts: number } }[]).reduce((sum, record) =>
            sum + (record.power?.inWatts || 0), 0) / records.length;
          displayValue = avgPower === 0 ? NO_DATA_DISPLAY : `${Math.round(avgPower)} W`;
          break;
        }

        case 'Speed': {
          const avgSpeed = (records as { speed?: { inMetersPerSecond: number } }[]).reduce((sum, record) =>
            sum + (record.speed?.inMetersPerSecond || 0), 0) / records.length;
          displayValue = avgSpeed === 0 ? NO_DATA_DISPLAY : `${avgSpeed.toFixed(2)} m/s`;
          break;
        }

        case 'RespiratoryRate': {
          const avgRespRate = (records as { rate?: number }[]).reduce((sum, record) =>
            sum + (record.rate || 0), 0) / records.length;
          displayValue = avgRespRate === 0 ? NO_DATA_DISPLAY : `${Math.round(avgRespRate)} br/min`;
          break;
        }

        case 'Nutrition': {
          const totalNutrition = (records as { energy?: { inCalories: number } }[]).reduce((sum, record) =>
            sum + (record.energy?.inCalories || 0), 0);
          displayValue = totalNutrition === 0 ? NO_DATA_DISPLAY : `${Math.round(totalNutrition / 1000)} kcal`;
          break;
        }

        case 'Workout': {
          displayValue = `${records.length} workouts`;
          break;
        }

        default:
          displayValue = `${records.length} record${records.length !== 1 ? 's' : ''}`;
          break;
      }

      result[metric.id] = displayValue;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`[healthDataDisplay] Error fetching ${metric.label}: ${errorMessage}`, 'ERROR');
      result[metric.id] = 'Error';
    }
  }

  return result;
}
