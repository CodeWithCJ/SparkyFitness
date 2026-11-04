import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';
import { getReadinessVitals } from '../models/reportRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../config/logging', () => ({ log: vi.fn() }));

describe('getReadinessVitals', () => {
  let client: MockDbClient;

  const answer = (rows: {
    sleep?: unknown[];
    rhr?: unknown[];
    hrv?: unknown[];
    rhrBaseline?: unknown;
    hrvBaseline?: unknown;
    resp?: unknown[];
    respBaseline?: unknown;
  }) => {
    client.query.mockImplementation(async (text: string) => {
      if (text.includes('PERCENTILE_CONT')) {
        return {
          rows: [
            text.includes('avg_overnight_hrv')
              ? rows.hrvBaseline
              : text.includes('average_respiration_value')
                ? rows.respBaseline
                : rows.rhrBaseline,
          ],
        };
      }
      if (text.includes('AS sleep_hours')) return { rows: rows.sleep ?? [] };
      return {
        rows: text.includes('avg_overnight_hrv')
          ? (rows.hrv ?? [])
          : text.includes('average_respiration_value')
            ? (rows.resp ?? [])
            : (rows.rhr ?? []),
      };
    });
  };

  beforeEach(() => {
    client = createMockDbClient();
    vi.mocked(getClient).mockResolvedValue(client as never);
  });

  it('builds each baseline as a median from the source of the latest reading', async () => {
    answer({
      sleep: [{ sleep_hours: '7.5' }],
      rhr: [{ value: '52', source: 'Garmin' }],
      hrv: [{ value: '41', source: 'Garmin' }],
      rhrBaseline: { baseline: '50', nights: '12' },
      hrvBaseline: { baseline: '68', nights: '9' },
    });
    const vitals = await getReadinessVitals(
      'u1',
      '2026-10-13',
      '2026-10-12',
      '2026-09-28'
    );
    expect(vitals).toEqual({
      sleepHours: 7.5,
      restingHeartRate: 52,
      restingHeartRateBaseline: 50,
      restingHeartRateBaselineNights: 12,
      hrv: 41,
      hrvBaseline: 68,
      hrvBaselineNights: 9,
      respiratoryRate: null,
      respiratoryRateBaseline: null,
      respiratoryRateBaselineNights: 0,
    });
    const baselineCalls = client.query.mock.calls.filter(([text]) =>
      String(text).includes('PERCENTILE_CONT')
    );
    expect(baselineCalls).toHaveLength(2);
    for (const [text, params] of baselineCalls) {
      expect(text).toContain('source = $4');
      expect(params[3]).toBe('Garmin');
    }
    expect(client.release).toHaveBeenCalled();
  });

  it('skips the baseline when no night has a reading', async () => {
    answer({ sleep: [{ sleep_hours: '6' }] });
    const vitals = await getReadinessVitals(
      'u1',
      '2026-10-13',
      '2026-10-12',
      '2026-09-28'
    );
    expect(vitals).toMatchObject({
      sleepHours: 6,
      hrv: null,
      hrvBaseline: null,
      hrvBaselineNights: 0,
      restingHeartRate: null,
      restingHeartRateBaselineNights: 0,
    });
    expect(
      client.query.mock.calls.some(([text]) =>
        String(text).includes('PERCENTILE_CONT')
      )
    ).toBe(false);
  });

  it('reads the latest breathing rate against its own baseline', async () => {
    answer({
      resp: [{ value: '16.4', source: 'Garmin' }],
      respBaseline: { baseline: '14.8', nights: '11' },
    });
    const vitals = await getReadinessVitals(
      'u1',
      '2026-10-13',
      '2026-10-12',
      '2026-09-28'
    );
    expect(vitals).toMatchObject({
      respiratoryRate: 16.4,
      respiratoryRateBaseline: 14.8,
      respiratoryRateBaselineNights: 11,
    });
  });
});
