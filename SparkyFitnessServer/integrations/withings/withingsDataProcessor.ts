import measurementRepository from '../../models/measurementRepository.js';
import { log } from '../../config/logging.js';
import exerciseRepository from '../../models/exercise.js';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import sleepRepository from '../../models/sleepRepository.js';
import { instantToDay } from '@workspace/shared';
import activityDetailsRepository from '../../models/activityDetailsRepository.js';
// Define a mapping for Withings metric types to SparkyFitness measurement types
// This can be extended as more Withings metrics are integrated
const WITHINGS_METRIC_MAPPING = {
  // Measures (Weight, Blood Pressure, etc.)
  1: {
    name: 'Weight',
    unit: 'kg',
    sparky_unit: 'kg',
    type: 'check_in_measurement',
    column: 'weight',
    frequency: 'Daily',
  },
  4: {
    name: 'Height',
    unit: 'm',
    sparky_unit: 'cm',
    type: 'check_in_measurement',
    column: 'height',
    frequency: 'Daily',
  },
  5: {
    name: 'Fat Free Mass',
    unit: 'kg',
    type: 'custom_measurement',
    categoryName: 'Fat Free Mass',
    frequency: 'Daily',
  },
  6: {
    name: 'Fat Ratio',
    unit: '%',
    sparky_unit: '%',
    type: 'check_in_measurement',
    column: 'body_fat_percentage',
    frequency: 'Daily',
  },
  8: {
    name: 'Fat Mass Weight',
    unit: 'kg',
    type: 'custom_measurement',
    categoryName: 'Fat Mass Weight',
    frequency: 'Daily',
  },
  9: {
    name: 'Diastolic Blood Pressure',
    unit: 'mmHg',
    type: 'custom_measurement',
    categoryName: 'Blood Pressure',
    frequency: 'Hourly',
  },
  10: {
    name: 'Systolic Blood Pressure',
    unit: 'mmHg',
    type: 'custom_measurement',
    categoryName: 'Blood Pressure',
    frequency: 'Hourly',
  },
  11: {
    name: 'Heart Pulse',
    unit: 'bpm',
    type: 'custom_measurement',
    categoryName: 'Heart Rate',
    frequency: 'Hourly',
  },
  12: {
    name: 'Body Temperature',
    unit: 'celsius',
    type: 'custom_measurement',
    categoryName: 'Body Temperature',
    frequency: 'Daily',
  },
  54: {
    name: 'SpO2',
    unit: '%',
    type: 'custom_measurement',
    categoryName: 'Blood Oxygen (SpO2)',
    frequency: 'Daily',
  },
  71: {
    name: 'Body Temperature',
    unit: 'celsius',
    type: 'custom_measurement',
    categoryName: 'Body Temperature',
    frequency: 'Daily',
  },
  73: {
    name: 'Skin Temperature',
    unit: 'celsius',
    type: 'custom_measurement',
    categoryName: 'Skin Temperature',
    frequency: 'Daily',
  },
  76: {
    name: 'Muscle Mass',
    unit: 'kg',
    type: 'custom_measurement',
    categoryName: 'Muscle Mass',
    frequency: 'Daily',
  },
  77: {
    name: 'Hydration',
    unit: 'kg',
    type: 'custom_measurement',
    categoryName: 'Hydration',
    frequency: 'Daily',
  },
  88: {
    name: 'Bone Mass',
    unit: 'kg',
    type: 'custom_measurement',
    categoryName: 'Bone Mass',
    frequency: 'Daily',
  },
  91: {
    name: 'Pulse Wave Velocity',
    unit: 'm/s',
    type: 'custom_measurement',
    categoryName: 'Pulse Wave Velocity',
    frequency: 'Daily',
  },
  123: {
    name: 'VO2 Max',
    unit: 'ml/min/kg',
    type: 'custom_measurement',
    categoryName: 'VO2 Max',
    frequency: 'Daily',
  },
  130: {
    name: 'Atrial Fibrillation Result',
    unit: 'boolean',
    type: 'custom_measurement',
    categoryName: 'Heart Health',
    frequency: 'Daily',
  },
  135: {
    name: 'QRS Interval Duration',
    unit: 'ms',
    type: 'custom_measurement',
    categoryName: 'ECG Metrics',
    frequency: 'Daily',
  },
  136: {
    name: 'PR Interval Duration',
    unit: 'ms',
    type: 'custom_measurement',
    categoryName: 'ECG Metrics',
    frequency: 'Daily',
  },
  137: {
    name: 'QT Interval Duration',
    unit: 'ms',
    type: 'custom_measurement',
    categoryName: 'ECG Metrics',
    frequency: 'Daily',
  },
  138: {
    name: 'Corrected QT Interval Duration',
    unit: 'ms',
    type: 'custom_measurement',
    categoryName: 'ECG Metrics',
    frequency: 'Daily',
  },
  139: {
    name: 'Atrial Fibrillation PPG',
    unit: 'boolean',
    type: 'custom_measurement',
    categoryName: 'Heart Health',
    frequency: 'Daily',
  },
  155: {
    name: 'Vascular Age',
    unit: 'years',
    type: 'custom_measurement',
    categoryName: 'Vascular Age',
    frequency: 'Daily',
  },
  167: {
    name: 'Nerve Health Score',
    unit: 'µS',
    type: 'custom_measurement',
    categoryName: 'Nerve Health',
    frequency: 'Daily',
  },
  168: {
    name: 'Extracellular Water',
    unit: 'kg',
    type: 'custom_measurement',
    categoryName: 'Body Water Breakdown',
    frequency: 'Daily',
  },
  169: {
    name: 'Intracellular Water',
    unit: 'kg',
    type: 'custom_measurement',
    categoryName: 'Body Water Breakdown',
    frequency: 'Daily',
  },
  170: {
    name: 'Visceral Fat',
    unit: 'index',
    type: 'custom_measurement',
    categoryName: 'Visceral Fat',
    frequency: 'Daily',
  },
  173: {
    name: 'Fat Free Mass Segments',
    unit: 'kg',
    type: 'custom_measurement',
    categoryName: 'Segmental Body Comp',
    frequency: 'Daily',
  },
  174: {
    name: 'Fat Mass Segments',
    unit: 'kg',
    type: 'custom_measurement',
    categoryName: 'Segmental Body Comp',
    frequency: 'Daily',
  },
  175: {
    name: 'Muscle Mass Segments',
    unit: 'kg',
    type: 'custom_measurement',
    categoryName: 'Segmental Body Comp',
    frequency: 'Daily',
  },
  196: {
    name: 'Electrodermal Activity',
    unit: 'µS',
    type: 'custom_measurement',
    categoryName: 'Stress Metrics',
    frequency: 'Daily',
  },
  226: {
    name: 'Basal Metabolic Rate',
    unit: 'kcal',
    type: 'custom_measurement',
    categoryName: 'Metabolism',
    frequency: 'Daily',
  },
  227: {
    name: 'Metabolic Age',
    unit: 'years',
    type: 'custom_measurement',
    categoryName: 'Metabolism',
    frequency: 'Daily',
  },
  229: {
    name: 'Electrochemical Skin Conductance',
    unit: 'µS',
    type: 'custom_measurement',
    categoryName: 'Nerve Health',
    frequency: 'Daily',
  },
  // Heart data (from /v2/heart API)
  heart_rate: {
    name: 'Resting Heart Rate',
    unit: 'bpm',
    type: 'custom_measurement',
    categoryName: 'Heart Rate',
    frequency: 'Hourly',
  },
  // Sleep data (from /v2/sleep API)
  total_sleep_duration: {
    name: 'Total Sleep Duration',
    unit: 'seconds',
    type: 'custom_measurement',
    categoryName: 'Sleep Metrics',
    frequency: 'Daily',
  },
  wake_up_count: {
    name: 'Wake Up Count',
    unit: 'count',
    type: 'custom_measurement',
    categoryName: 'Sleep Metrics',
    frequency: 'Daily',
  },
  sleep_score: {
    name: 'Sleep Score',
    unit: 'score',
    type: 'custom_measurement',
    categoryName: 'Sleep Metrics',
    frequency: 'Daily',
  },
  // ECG / Afib (from heart series)
  afib: {
    name: 'Atrial Fibrillation Result',
    unit: 'boolean',
    type: 'custom_measurement',
    categoryName: 'Heart Health',
    frequency: 'Daily',
  },
};
async function processWithingsMeasures(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  measuregrps: any,
  timezone = 'UTC'
) {
  if (!Array.isArray(measuregrps) || measuregrps.length === 0) {
    log('info', `No Withings measures data to process for user ${userId}.`);
    return;
  }
  for (const group of measuregrps) {
    // Only process actual measurements (category 1), skip user objectives (category 2)
    if (group.category !== 1) continue;
    const timestamp = group.date || group.timestamp;
    if (!timestamp || isNaN(timestamp)) {
      log(
        'warn',
        `Invalid date/timestamp in Withings measure group: ${JSON.stringify(group)}`
      );
      continue;
    }
    const entryDate = instantToDay(timestamp * 1000, timezone); // Convert Unix timestamp to YYYY-MM-DD
    const measurementsToUpsert = {};
    const customMeasurementsToUpsert = [];
    for (const measure of group.measures) {
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      const metricInfo = WITHINGS_METRIC_MAPPING[measure.type];
      if (metricInfo) {
        // Withings measures often come with a 'unit' field which is a power of 10.
        // E.g., weight in kg with unit 0 means actual kg, unit -1 means 0.1 kg.
        let value = measure.value * Math.pow(10, measure.unit); // Use measure.unit from Withings API for scaling
        // Apply unit conversions for check_in_measurement types if needed
        if (
          metricInfo.type === 'check_in_measurement' &&
          metricInfo.sparky_unit
        ) {
          if (metricInfo.unit === 'm' && metricInfo.sparky_unit === 'cm') {
            value *= 100; // Convert meters to centimeters
          }
          // Add other conversions here if necessary (e.g., kg to lbs, but assuming kg is standard for now)
        }
        if (metricInfo.type === 'check_in_measurement' && metricInfo.column) {
          // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
          measurementsToUpsert[metricInfo.column] = value;
        } else if (
          metricInfo.type === 'custom_measurement' &&
          metricInfo.categoryName
        ) {
          customMeasurementsToUpsert.push({
            categoryName: metricInfo.categoryName,
            value: value,
            unit: metricInfo.unit, // Store Withings unit for custom measurements
            entryDate: entryDate,
            entryHour: new Date(timestamp * 1000).getUTCHours(), // Use UTC hour
            entryTimestamp: new Date(timestamp * 1000).toISOString(),
            frequency: metricInfo.frequency, // Use frequency from mapping
          });
        }
      } else {
        log(
          'warn',
          `Unknown Withings measure type: ${measure.type}. Skipping.`
        );
      }
    }
    // Upsert into check_in_measurements if there are any standard measurements
    if (Object.keys(measurementsToUpsert).length > 0) {
      await measurementRepository.upsertCheckInMeasurements(
        userId,
        createdByUserId,
        entryDate,
        measurementsToUpsert
      );
      log(
        'info',
        `Upserted standard Withings measures for user ${userId} on ${entryDate}.`
      );
    }
    // Upsert into custom_measurements
    for (const customMeasurement of customMeasurementsToUpsert) {
      await upsertCustomMeasurementLogic(
        userId,
        createdByUserId,
        customMeasurement,
        'Withings'
      );
    }
  }
}
async function processWithingsHeartData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  heartSeries = [],
  timezone = 'UTC'
) {
  if (!Array.isArray(heartSeries) || heartSeries.length === 0) {
    log('info', `No Withings heart data to process for user ${userId}.`);
    return;
  }
  for (const series of heartSeries) {
    // @ts-expect-error TS(2339): Property 'date' does not exist on type 'never'.
    const timestamp = series.date || series.timestamp;
    if (!timestamp || isNaN(timestamp)) {
      log(
        'warn',
        `Invalid date/timestamp in Withings heart series: ${JSON.stringify(series)}`
      );
      continue;
    }
    const entryDate = instantToDay(timestamp * 1000, timezone);
    const entryHour = new Date(timestamp * 1000).getUTCHours();
    const entryTimestamp = new Date(timestamp * 1000).toISOString();
    // Process Heart Rate
    // @ts-expect-error TS(2339): Property 'heart_rate' does not exist on type 'neve... Remove this comment to see the full error message
    if (series.heart_rate) {
      const metricInfo = WITHINGS_METRIC_MAPPING.heart_rate;
      const customMeasurement = {
        categoryName: metricInfo.categoryName,
        // @ts-expect-error TS(2339): Property 'heart_rate' does not exist on type 'neve... Remove this comment to see the full error message
        value: series.heart_rate,
        unit: metricInfo.unit,
        entryDate: entryDate,
        entryHour: entryHour,
        entryTimestamp: entryTimestamp,
        frequency: metricInfo.frequency,
      };
      await upsertCustomMeasurementLogic(
        userId,
        createdByUserId,
        customMeasurement,
        'Withings'
      );
      log(
        'info',
        `Upserted Withings heart rate for user ${userId} on ${entryDate}.`
      );
    }
    // Process Afib from ECG
    // @ts-expect-error TS(2339): Property 'ecg' does not exist on type 'never'.
    if (series.ecg && series.ecg.afib !== undefined) {
      const metricInfo = WITHINGS_METRIC_MAPPING.afib;
      const customMeasurement = {
        categoryName: metricInfo.categoryName,
        // @ts-expect-error TS(2339): Property 'ecg' does not exist on type 'never'.
        value: series.ecg.afib,
        unit: metricInfo.unit,
        entryDate: entryDate,
        entryHour: entryHour,
        entryTimestamp: entryTimestamp,
        frequency: metricInfo.frequency,
      };
      await upsertCustomMeasurementLogic(
        userId,
        createdByUserId,
        customMeasurement,
        'Withings'
      );
      log(
        'info',
        `Upserted Withings afib result for user ${userId} on ${entryDate}.`
      );
    }
    // Process Blood Pressure from Heart API (BPM Core)
    // @ts-expect-error TS(2339): Property 'bloodpressure' does not exist on type 'n... Remove this comment to see the full error message
    if (series.bloodpressure) {
      // @ts-expect-error TS(2339): Property 'bloodpressure' does not exist on type 'n... Remove this comment to see the full error message
      if (series.bloodpressure.systole) {
        const systolicInfo = WITHINGS_METRIC_MAPPING[10];
        await upsertCustomMeasurementLogic(
          userId,
          createdByUserId,
          {
            categoryName: systolicInfo.categoryName,
            // @ts-expect-error TS(2339): Property 'bloodpressure' does not exist on type 'n... Remove this comment to see the full error message
            value: series.bloodpressure.systole,
            unit: systolicInfo.unit,
            entryDate: entryDate,
            entryHour: entryHour,
            entryTimestamp: entryTimestamp,
            frequency: systolicInfo.frequency,
          },
          'Withings'
        );
      }
      // @ts-expect-error TS(2339): Property 'bloodpressure' does not exist on type 'n... Remove this comment to see the full error message
      if (series.bloodpressure.diastole) {
        const diastolicInfo = WITHINGS_METRIC_MAPPING[9];
        await upsertCustomMeasurementLogic(
          userId,
          createdByUserId,
          {
            categoryName: diastolicInfo.categoryName,
            // @ts-expect-error TS(2339): Property 'bloodpressure' does not exist on type 'n... Remove this comment to see the full error message
            value: series.bloodpressure.diastole,
            unit: diastolicInfo.unit,
            entryDate: entryDate,
            entryHour: entryHour,
            entryTimestamp: entryTimestamp,
            frequency: diastolicInfo.frequency,
          },
          'Withings'
        );
      }
      log(
        'info',
        `Upserted Withings heart-rate-sync blood pressure for user ${userId} on ${entryDate}.`
      );
    }
  }
}
async function processWithingsSleepData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  sleepSeries = [],
  sleepSummary = [],
  timezone = 'UTC'
) {
  // Normalize inputs to always be arrays (Withings sometimes returns a single object)
  const seriesArr = Array.isArray(sleepSeries)
    ? sleepSeries
    : sleepSeries
      ? [sleepSeries]
      : [];
  const summaryArr = Array.isArray(sleepSummary)
    ? sleepSummary
    : sleepSummary
      ? [sleepSummary]
      : [];
  if (seriesArr.length === 0 && summaryArr.length === 0) {
    log('info', `No Withings sleep data to process for user ${userId}.`);
    return;
  }
  // Map Withings sleep states to SparkyFitness stage types
  const SLEEP_STAGE_MAPPING = {
    0: 'awake',
    1: 'light',
    2: 'deep',
    3: 'rem',
  };
  // Identify the date range for deletion
  let minDate = null;
  let maxDate = null;
  const allRelevantEntries = [...seriesArr, ...summaryArr];
  for (const item of allRelevantEntries) {
    // @ts-expect-error TS(2339): Property 'date' does not exist on type 'never'.
    const timestamp = item.date || item.startdate || item.timestamp;
    if (timestamp) {
      // If date is "YYYY-MM-DD" string, use it directly, otherwise convert from unix
      const entryDate =
        typeof timestamp === 'string' && timestamp.includes('-')
          ? timestamp
          : instantToDay(timestamp * 1000, timezone);
      if (!minDate || entryDate < minDate) minDate = entryDate;
      if (!maxDate || entryDate > maxDate) maxDate = entryDate;
    }
  }
  if (minDate && maxDate) {
    await sleepRepository.deleteSleepEntriesByEntrySourceAndDate(
      userId,
      'Withings',
      minDate,
      maxDate
    );
    log(
      'info',
      `Deleted existing Withings sleep entries between ${minDate} and ${maxDate} for user ${userId}.`
    );
  }
  const sleepEntryMap = new Map(); // entry_date -> db_id
  // 1. Process Summaries (The most reliable source for high-level metrics)
  for (const summary of summaryArr) {
    const entryDate =
      // @ts-expect-error TS(2339): Property 'date' does not exist on type 'never'.
      typeof summary.date === 'string'
        ? // @ts-expect-error TS(2339): Property 'date' does not exist on type 'never'.
          summary.date
        : // @ts-expect-error TS(2339): Property 'date' does not exist on type 'never'.
          instantToDay(summary.date * 1000, timezone);
    // Default to start/end dates
    // @ts-expect-error TS(2339): Property 'startdate' does not exist on type 'never... Remove this comment to see the full error message
    let bedtimeTs = summary.startdate;
    // @ts-expect-error TS(2339): Property 'enddate' does not exist on type 'never'.
    let wakeTimeTs = summary.enddate;
    // Refine with night_events if available (1=got in bed, 4=got out of bed)
    // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
    if (summary.data.night_events) {
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      const events = summary.data.night_events;
      // Withings says keys are strings of the event type, value is array of offsets
      if (events['1'] && events['1'].length > 0) {
        // @ts-expect-error TS(2339): Property 'startdate' does not exist on type 'never... Remove this comment to see the full error message
        bedtimeTs = summary.startdate + events['1'][0];
      }
      if (events['4'] && events['4'].length > 0) {
        // @ts-expect-error TS(2339): Property 'startdate' does not exist on type 'never... Remove this comment to see the full error message
        wakeTimeTs = summary.startdate + events['4'][events['4'].length - 1];
      }
    }
    const bedtime = new Date(bedtimeTs * 1000).toISOString();
    const wakeTime = new Date(wakeTimeTs * 1000).toISOString();
    const sleepEntryData = {
      entry_date: entryDate,
      bedtime: bedtime,
      wake_time: wakeTime,
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      duration_in_seconds: summary.data.total_timeinbed || 0,
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      time_asleep_in_seconds: summary.data.total_sleep_time || 0,
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      sleep_score: summary.data.sleep_score || 0,
      source: 'Withings',
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      awake_count: summary.data.wakeupcount || 0,
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      deep_sleep_seconds: summary.data.deepsleepduration || 0,
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      light_sleep_seconds: summary.data.lightsleepduration || 0,
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      rem_sleep_seconds: summary.data.remsleepduration || 0,
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      awake_sleep_seconds: summary.data.wakeupduration || 0,
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      resting_heart_rate: summary.data.hr_average || null,
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      average_respiration_value: summary.data.rr_average || null,
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      lowest_respiration_value: summary.data.rr_min || null,
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      highest_respiration_value: summary.data.rr_max || null,
    };
    const createdEntry = await sleepRepository.upsertSleepEntry(
      userId,
      createdByUserId,
      sleepEntryData
    );
    sleepEntryMap.set(entryDate, createdEntry.id);
    log('info', `Processed sleep summary for ${entryDate} for user ${userId}.`);
  }
  // 2. Process Detailed Series (Sleep Stages)
  // Match each stage to its parent summary's entry_date so overnight sessions
  // that cross local midnight stay grouped under one sleep entry.
  const summaryRanges = summaryArr.map((s) => ({
    // @ts-expect-error TS(2339): Property 'startdate' does not exist on type 'never... Remove this comment to see the full error message
    start: s.startdate,
    // @ts-expect-error TS(2339): Property 'enddate' does not exist on type 'never'.
    end: s.enddate,
    entryDate:
      // @ts-expect-error TS(2339): Property 'date' does not exist on type 'never'.
      typeof s.date === 'string'
        ? // @ts-expect-error TS(2339): Property 'date' does not exist on type 'never'.
          s.date
        : // @ts-expect-error TS(2339): Property 'date' does not exist on type 'never'.
          instantToDay(s.date * 1000, timezone),
  }));
  const stagesByDate = new Map();
  for (const segment of seriesArr) {
    // @ts-expect-error TS(2339): Property 'startdate' does not exist on type 'never... Remove this comment to see the full error message
    if (segment.startdate && segment.state !== undefined) {
      const parent = summaryRanges.find(
        // @ts-expect-error TS(2339): Property 'startdate' does not exist on type 'never... Remove this comment to see the full error message
        (s) => segment.startdate >= s.start && segment.startdate <= s.end
      );
      const entryDate = parent
        ? parent.entryDate
        : // @ts-expect-error TS(2339): Property 'startdate' does not exist on type 'never... Remove this comment to see the full error message
          instantToDay(segment.startdate * 1000, timezone);
      if (!stagesByDate.has(entryDate)) {
        stagesByDate.set(entryDate, []);
      }
      stagesByDate.get(entryDate).push(segment);
    }
  }
  for (const [entryDate, segments] of stagesByDate.entries()) {
    let entryId = sleepEntryMap.get(entryDate);
    // If no summary was found for this date, we create a basic entry from the series
    if (!entryId) {
      const firstSegment = segments[0];
      const lastSegment = segments[segments.length - 1];
      const bedtime = new Date(firstSegment.startdate * 1000).toISOString();
      const wakeTime = new Date(lastSegment.enddate * 1000).toISOString();
      const basicEntry = await sleepRepository.upsertSleepEntry(
        userId,
        createdByUserId,
        {
          entry_date: entryDate,
          bedtime: bedtime,
          wake_time: wakeTime,
          source: 'Withings',
          duration_in_seconds: lastSegment.enddate - firstSegment.startdate,
          time_asleep_in_seconds: 0,
        }
      );
      entryId = basicEntry.id;
      sleepEntryMap.set(entryDate, entryId);
    }
    const stageAggregates = { deep: 0, light: 0, rem: 0, awake: 0 };
    for (const segment of segments) {
      const duration = segment.enddate - segment.startdate;
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      const stageType = SLEEP_STAGE_MAPPING[segment.state] || 'awake';
      const stageKey = stageType; // Already lowercase from SLEEP_STAGE_MAPPING
      // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
      if (stageAggregates[stageKey] !== undefined) {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        stageAggregates[stageKey] += duration;
      }
      await sleepRepository.upsertSleepStageEvent(userId, entryId, {
        stage_type: stageType,
        start_time: new Date(segment.startdate * 1000).toISOString(),
        end_time: new Date(segment.enddate * 1000).toISOString(),
        duration_in_seconds: duration,
      });
    }
    await sleepRepository.updateSleepEntry(userId, entryId, createdByUserId, {
      deep_sleep_seconds: stageAggregates.deep,
      light_sleep_seconds: stageAggregates.light,
      rem_sleep_seconds: stageAggregates.rem,
      awake_sleep_seconds: stageAggregates.awake,
      time_asleep_in_seconds:
        stageAggregates.deep + stageAggregates.light + stageAggregates.rem,
    });
    log(
      'info',
      `Processed ${segments.length} sleep stages for ${entryDate} for user ${userId}.`
    );
  }
}
async function upsertCustomMeasurementLogic(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customMeasurement: any,
  source = 'manual'
) {
  const {
    categoryName,
    value,
    entryDate,
    entryHour,
    entryTimestamp,
    frequency,
  } = customMeasurement;
  let category = await measurementRepository.getCustomCategories(userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  category = category.find((cat: any) => cat.name === categoryName);
  let categoryId;
  if (!category) {
    // Create new custom category if it doesn't exist
    const newCategoryData = {
      user_id: userId,
      name: categoryName,
      frequency: frequency, // 'Daily', 'Hourly', 'All', 'Unlimited'
      measurement_type: 'health', // Or a more specific type if available
      data_type: typeof value === 'number' ? 'numeric' : 'text',
      created_by_user_id: createdByUserId,
    };
    const newCategory =
      await measurementRepository.createCustomCategory(newCategoryData);
    categoryId = newCategory.id;
    log(
      'info',
      `Created new custom category '${categoryName}' for user ${userId}.`
    );
  } else {
    categoryId = category.id;
  }
  // Upsert the custom measurement entry
  await measurementRepository.upsertCustomMeasurement(
    userId,
    createdByUserId,
    categoryId,
    value,
    entryDate,
    entryHour,
    entryTimestamp,
    null, // notes
    frequency,
    source
  );
}
async function processWithingsActivity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  activities = []
) {
  if (!Array.isArray(activities) || activities.length === 0) {
    log('info', `No Withings activity data to process for user ${userId}.`);
    return;
  }
  for (const activity of activities) {
    // @ts-expect-error TS(2339): Property 'date' does not exist on type 'never'.
    const entryDate = activity.date; // "YYYY-MM-DD"
    // 1. Process Steps
    // @ts-expect-error TS(2339): Property 'steps' does not exist on type 'never'.
    if (activity.steps !== undefined) {
      await measurementRepository.upsertStepData(
        userId,
        createdByUserId,
        // @ts-expect-error TS(2339): Property 'steps' does not exist on type 'never'.
        activity.steps,
        entryDate
      );
      log(
        'info',
        // @ts-expect-error TS(2339): Property 'steps' does not exist on type 'never'.
        `Upserted Withings daily steps for user ${userId} on ${entryDate}: ${activity.steps}.`
      );
    }
    // 2. Process Total Calories (Active + Passive)
    // @ts-expect-error TS(2339): Property 'totalcalories' does not exist on type 'n... Remove this comment to see the full error message
    if (activity.totalcalories !== undefined) {
      await upsertCustomMeasurementLogic(
        userId,
        createdByUserId,
        {
          categoryName: 'Metabolism',
          // @ts-expect-error TS(2339): Property 'totalcalories' does not exist on type 'n... Remove this comment to see the full error message
          value: activity.totalcalories,
          unit: 'kcal',
          entryDate: entryDate,
          entryHour: 0,
          entryTimestamp: new Date(entryDate).toISOString(),
          frequency: 'Daily',
        },
        'Withings'
      );
    }
    // 3. Process Elevation (Floors)
    // @ts-expect-error TS(2339): Property 'elevation' does not exist on type 'never... Remove this comment to see the full error message
    if (activity.elevation !== undefined) {
      await upsertCustomMeasurementLogic(
        userId,
        createdByUserId,
        {
          categoryName: 'Floors Climbed',
          // @ts-expect-error TS(2339): Property 'elevation' does not exist on type 'never... Remove this comment to see the full error message
          value: activity.elevation,
          unit: 'count',
          entryDate: entryDate,
          entryHour: 0,
          entryTimestamp: new Date(entryDate).toISOString(),
          frequency: 'Daily',
        },
        'Withings'
      );
    }
  }
}

async function processWithingsWorkouts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdByUserId: any,
  workouts = []
) {
  if (!Array.isArray(workouts) || workouts.length === 0) {
    log('info', `No Withings workout data to process for user ${userId}.`);
    return;
  }
  // Define a mapping for Withings workout categories to SparkyFitness exercise names
  // This list can be expanded as more categories are identified or requested.
  const WITHINGS_WORKOUT_CATEGORY_MAPPING = {
    1: 'Walk',
    2: 'Run',
    3: 'Hiking',
    4: 'Skating',
    5: 'BMX',
    6: 'Cycling',
    7: 'Swimming',
    8: 'Surfing',
    9: 'Kitesurfing',
    10: 'Windsurfing',
    11: 'Bodyboard',
    12: 'Tennis',
    13: 'Table Tennis',
    14: 'Squash',
    15: 'Badminton',
    16: 'Lift Weights',
    17: 'Calisthenics',
    18: 'Elliptical',
    19: 'Pilates',
    20: 'Basketball',
    21: 'Soccer',
    22: 'Football',
    23: 'Rugby',
    24: 'Volleyball',
    25: 'Waterpolo',
    26: 'Horse Riding',
    27: 'Golf',
    28: 'Yoga',
    29: 'Dancing',
    30: 'Boxing',
    31: 'Fencing',
    32: 'Wrestling',
    33: 'Martial Arts',
    34: 'Skiing',
    35: 'Snowboarding',
    36: 'Other',
    128: 'No Activity',
    187: 'Rowing',
    188: 'Zumba',
    191: 'Baseball',
    192: 'Handball',
    193: 'Hockey',
    194: 'Ice Hockey',
    195: 'Climbing',
    196: 'Ice Skating',
    272: 'MultiSport',
    306: 'Indoor Walking',
    307: 'Indoor Running',
    308: 'Indoor Cycling',
  };
  // First, delete all existing Withings exercise entries for the date range to prevent duplicates.
  // We iterate through the dates covered by the workouts and delete entries for each day,
  // specifically targeting entries with 'Withings' as their source.
  const processedDates = new Set();
  for (const workout of workouts) {
    // @ts-expect-error TS(2339): Property 'startdate' does not exist on type 'never... Remove this comment to see the full error message
    if (!workout.startdate || isNaN(workout.startdate)) {
      log(
        'warn',
        `Invalid startdate in Withings workout: ${JSON.stringify(workout)}`
      );
      continue;
    }
    // @ts-expect-error TS(2339): Property 'startdate' does not exist on type 'never... Remove this comment to see the full error message
    const entryDate = new Date(workout.startdate * 1000)
      .toISOString()
      .split('T')[0];
    if (!processedDates.has(entryDate)) {
      await exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate(
        userId,
        entryDate,
        entryDate,
        'Withings'
      );
      processedDates.add(entryDate);
    }
  }
  for (const workout of workouts) {
    try {
      // @ts-expect-error TS(2339): Property 'category' does not exist on type 'never'... Remove this comment to see the full error message
      const workoutCategory = workout.category;
      const exerciseName =
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        WITHINGS_WORKOUT_CATEGORY_MAPPING[workoutCategory] ||
        `Withings Workout - Category ${workoutCategory}`;
      // The sourceId for the exercise definition remains the same, as it identifies the type of exercise.
      const exerciseSourceId = `withings-workout-${workoutCategory}`;
      let exercise = await exerciseRepository.getExerciseBySourceAndSourceId(
        'Withings',
        exerciseSourceId
      ); // Corrected variable name
      if (!exercise) {
        // If not found by source and sourceId, try to find by name (for user-created exercises)
        // @ts-expect-error TS(2554): Expected 4 arguments, but got 2.
        const searchResults = await exerciseRepository.searchExercises(
          exerciseName,
          userId
        );
        if (searchResults && searchResults.length > 0) {
          exercise = searchResults[0]; // Use the first matching exercise
          log(
            'info',
            `Found existing exercise by name for Withings workout category ${workoutCategory}: ${exerciseName}`
          );
        }
      }
      if (!exercise) {
        // @ts-expect-error TS(2339): Property 'enddate' does not exist on type 'never'.
        const durationSeconds = workout.enddate - workout.startdate;
        // Create a new exercise if it doesn't exist
        const newExerciseData = {
          user_id: userId,
          name: exerciseName,
          category: 'Cardio', // Default category, can be refined
          calories_per_hour:
            // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
            workout.data.calories && durationSeconds > 0
              ? // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
                Math.round(workout.data.calories / (durationSeconds / 3600))
              : 300, // Estimate if possible, round to nearest integer
          description: `Automatically created from Withings workout category ${workoutCategory}.`,
          is_custom: true,
          shared_with_public: false,
          source: 'Withings',
          source_id: exerciseSourceId, // Corrected variable name
        };
        log(
          'debug',
          // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
          `Withings workout.data.calories: ${workout.data.calories}, durationSeconds: ${durationSeconds}`
        );
        log(
          'debug',
          // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
          `Withings workout raw data: ${JSON.stringify(workout.data)}`
        );
        log(
          'debug',
          `New exercise data before creation: ${JSON.stringify(newExerciseData)}`
        );
        exercise = await exerciseRepository.createExercise(newExerciseData);
        log(
          'info',
          `Created new exercise for Withings workout category ${workoutCategory}: ${exercise.name}`
        );
      }
      // Calculate duration in minutes
      // @ts-expect-error TS(2339): Property 'enddate' does not exist on type 'never'.
      const durationSeconds = workout.enddate - workout.startdate;
      const durationMinutes = Math.round(durationSeconds / 60);
      // Prepare exercise entry data
      // @ts-expect-error TS(2339): Property 'startdate' does not exist on type 'never... Remove this comment to see the full error message
      const entryDate = new Date(workout.startdate * 1000)
        .toISOString()
        .split('T')[0];
      // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
      const caloriesBurned = workout.data.calories || 0;
      const exerciseEntryData = {
        exercise_id: exercise.id,
        duration_minutes: durationMinutes,
        calories_burned: caloriesBurned,
        entry_date: entryDate,
        // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
        notes: `Logged from Withings workout: ${exercise.name}. Distance: ${workout.data.distance || 0}m, Steps: ${workout.data.steps || 0}. Intensity: ${workout.data.intensity || 0}/100.`,
        // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
        avg_heart_rate: workout.data.hr_average || null,
        sets: [
          {
            set_number: 1,
            set_type: 'Working Set',
            reps: 1,
            weight: 0,
            duration: durationMinutes,
            rest_time: 0,
            notes: '',
          },
        ],
      };
      const newEntry = await exerciseEntryRepository.createExerciseEntry(
        userId,
        exerciseEntryData,
        createdByUserId,
        'Withings'
      );
      log(
        'info',
        `Logged Withings workout entry for user ${userId}: ${exercise.name} on ${entryDate}.`
      );
      // Add activity details (HR Zones, etc.)
      if (newEntry && newEntry.id) {
        await activityDetailsRepository.createActivityDetail(userId, {
          exercise_entry_id: newEntry.id,
          provider_name: 'Withings',
          detail_type: 'workout_summary',
          detail_data: {
            // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
            ...workout.data,
            hr_zones: {
              // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
              light: workout.data.hr_zone_0,
              // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
              moderate: workout.data.hr_zone_1,
              // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
              intense: workout.data.hr_zone_2,
              // @ts-expect-error TS(2339): Property 'data' does not exist on type 'never'.
              peak: workout.data.hr_zone_3,
            },
          },
          created_by_user_id: createdByUserId,
        });
      }
    } catch (error) {
      log(
        'error',
        // @ts-expect-error TS(2339): Property 'category' does not exist on type 'never'... Remove this comment to see the full error message
        `Error processing Withings workout for user ${userId}, workout category ${workout.category}: ${error.name}: ${error.message}`
      );
    }
  }
}
export { processWithingsMeasures };
export { processWithingsHeartData };
export { processWithingsSleepData };
export { processWithingsActivity };
export { processWithingsWorkouts };
export default {
  processWithingsMeasures,
  processWithingsHeartData,
  processWithingsSleepData,
  processWithingsActivity,
  processWithingsWorkouts,
};
