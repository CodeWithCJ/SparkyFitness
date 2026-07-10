import { describe, expect, it } from 'vitest';
import {
  mapHuaweiActivities,
  mapHuaweiDailySummary,
  mapHuaweiSleepRecords,
} from '../integrations/huaweihealth/huaweiHealthMapper.js';

const value = (fieldName: string, numericValue: number) => ({
  fieldName,
  floatValue: numericValue,
});

describe('Huawei Health response mapping', () => {
  it('maps official daily-polymerize fields into existing health ingest types', () => {
    const entries = mapHuaweiDailySummary(
      {
        group: [
          {
            startTime: Date.parse('2026-07-09T00:00:00.000Z'),
            endTime: Date.parse('2026-07-09T23:59:59.999Z'),
            sampleSet: [
              {
                samplePoints: [
                  {
                    dataTypeName: 'com.huawei.continuous.steps.total',
                    value: [{ fieldName: 'steps', integerValue: 9000 }],
                  },
                  {
                    dataTypeName: 'com.huawei.continuous.calories.burnt.total',
                    value: [value('calories_total', 540.5)],
                  },
                  {
                    dataTypeName: 'com.huawei.continuous.distance.total',
                    value: [value('distance', 6700.25)],
                  },
                  {
                    dataTypeName: 'com.huawei.continuous.heart_rate.statistics',
                    value: [
                      value('avg', 78),
                      value('min', 52),
                      value('max', 148),
                    ],
                  },
                  {
                    dataTypeName:
                      'com.huawei.continuous.resting_heart_rate.statistics',
                    value: [value('avg', 58), value('last', 57)],
                  },
                  {
                    dataTypeName: 'com.huawei.continuous.spo2.statistics',
                    value: [
                      value('saturation_avg', 97.2),
                      value('saturation_last', 98),
                    ],
                  },
                  {
                    dataTypeName:
                      'com.huawei.continuous.body_weight.statistics',
                    value: [value('avg', 81.5), value('last', 81.2)],
                  },
                ],
              },
            ],
          },
        ],
      },
      180
    );

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'steps', value: 9000, unit: 'steps' }),
        expect.objectContaining({
          type: 'ActiveCaloriesBurned',
          value: 540.5,
          unit: 'kcal',
        }),
        expect.objectContaining({
          type: 'Distance',
          value: 6700.25,
          unit: 'm',
        }),
        expect.objectContaining({
          type: 'heart_rate_avg',
          value: 78,
          unit: 'bpm',
        }),
        expect.objectContaining({ type: 'heart_rate_min', value: 52 }),
        expect.objectContaining({ type: 'heart_rate_max', value: 148 }),
        expect.objectContaining({ type: 'RestingHeartRate', value: 57 }),
        expect.objectContaining({ type: 'OxygenSaturation', value: 98 }),
        expect.objectContaining({ type: 'weight', value: 81.2, unit: 'kg' }),
      ])
    );
    expect(entries).toHaveLength(9);
    expect(entries.every((entry) => entry.source === 'HUAWEI Health')).toBe(
      true
    );
    expect(entries.every((entry) => entry.date === '2026-07-09')).toBe(true);
    expect(
      entries.every((entry) => entry.record_utc_offset_minutes === 180)
    ).toBe(true);
  });

  it('maps sleep records using wake time as the day anchor and preserves stage totals', () => {
    const entries = mapHuaweiSleepRecords({
      healthRecords: [
        {
          id: 'sleep-record-1',
          dataTypeName: 'com.huawei.health.record.sleep',
          value: [
            { fieldName: 'fall_asleep_time', longValue: 1_783_633_200_000 },
            { fieldName: 'wakeup_time', longValue: 1_783_662_000_000 },
            { fieldName: 'all_sleep_time', integerValue: 420 },
            { fieldName: 'light_sleep_time', integerValue: 210 },
            { fieldName: 'deep_sleep_time', integerValue: 120 },
            { fieldName: 'dream_time', integerValue: 90 },
            { fieldName: 'awake_time', integerValue: 60 },
            { fieldName: 'sleep_score', integerValue: 86 },
          ],
        },
      ],
    });

    expect(entries).toEqual([
      expect.objectContaining({
        type: 'SleepSession',
        source: 'HUAWEI Health',
        source_id: 'sleep-record-1',
        bedtime: new Date(1_783_633_200_000).toISOString(),
        wake_time: new Date(1_783_662_000_000).toISOString(),
        timestamp: new Date(1_783_633_200_000).toISOString(),
        duration_in_seconds: 28_800,
        time_asleep_in_seconds: 25_200,
        light_sleep_seconds: 12_600,
        deep_sleep_seconds: 7200,
        rem_sleep_seconds: 5400,
        awake_sleep_seconds: 3600,
        sleep_score: 86,
      }),
    ]);
  });

  it('maps activity summaries without persisting Huawei account metadata', () => {
    const entries = mapHuaweiActivities({
      activityRecord: [
        {
          id: 'activity-1',
          name: 'Morning ride',
          startTime: Date.parse('2026-07-09T04:00:00.000Z'),
          endTime: Date.parse('2026-07-09T05:00:00.000Z'),
          activityType: 97,
          activeTime: 3_300_000,
          timeZone: '+0300',
          appInfo: { appName: 'Private app', clientId: 'private-client' },
          activitySummary: {
            dataSummary: [
              {
                dataTypeName: 'com.huawei.continuous.distance.total',
                value: [value('distance', 17_862)],
              },
              {
                dataTypeName: 'com.huawei.continuous.calories.burnt.total',
                value: [value('calories_total', 430)],
              },
              {
                dataTypeName:
                  'com.huawei.continuous.exercise_heart_rate.statistics',
                value: [value('avg', 132), value('max', 166)],
              },
            ],
          },
        },
      ],
      deletedActivityRecord: [],
    });

    expect(entries).toEqual([
      expect.objectContaining({
        type: 'Workout',
        source: 'HUAWEI Health',
        source_id: 'activity-1',
        activityType: 'Indoor Cycling',
        timestamp: '2026-07-09T04:00:00.000Z',
        duration: 3300,
        caloriesBurned: 430,
        distance: 17_862,
        record_utc_offset_minutes: 180,
        raw_data: {
          huaweiActivityType: 97,
          averageHeartRate: 132,
          maximumHeartRate: 166,
        },
      }),
    ]);
    expect(JSON.stringify(entries)).not.toContain('private-client');
    expect(JSON.stringify(entries)).not.toContain('Private app');
  });
});
