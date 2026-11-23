import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios, { AxiosHeaders, type AxiosResponse } from 'axios';
import {
  parseLiftosaurValue,
  importMeasurementsFromLiftosaur,
} from '../integrations/liftosaur/liftosaurMeasurementsService.js';
import measurementService from '../services/measurementService.js';

vi.mock('axios');
vi.mock('../services/measurementService.js');
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

function axiosOk<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
}

describe('liftosaurMeasurementsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(measurementService.processHealthData).mockImplementation(
      async (records) =>
        ({
          message: 'ok',
          processed: records,
          errors: [],
          skipped: [],
        }) as never
    );
  });

  describe('parseLiftosaurValue', () => {
    it('parses weight values in kg and converts lb to kg', () => {
      expect(parseLiftosaurValue('82.5kg', 'kg')).toBe(82.5);
      expect(parseLiftosaurValue('82.5 kg', 'kg')).toBe(82.5);
      expect(parseLiftosaurValue('180lb', 'kg')).toBe(81.65); // 180 * 0.45359237 ≈ 81.65
      expect(parseLiftosaurValue('200 lb', 'kg')).toBe(90.72);
      expect(parseLiftosaurValue('invalid', 'kg')).toBeNull();
    });

    it('parses percentage values', () => {
      expect(parseLiftosaurValue('18.5%', '%')).toBe(18.5);
      expect(parseLiftosaurValue('20 %', '%')).toBe(20);
      expect(parseLiftosaurValue('15', '%')).toBe(15);
    });

    it('parses length values in cm and converts in to cm', () => {
      expect(parseLiftosaurValue('37cm', 'cm')).toBe(37);
      expect(parseLiftosaurValue('15in', 'cm')).toBe(38.1); // 15 * 2.54 = 38.1
      expect(parseLiftosaurValue('10 in', 'cm')).toBe(25.4);
    });
  });

  describe('importMeasurementsFromLiftosaur', () => {
    it('fetches measurements and forwards them to measurementService.processHealthData', async () => {
      const nowMs = Date.now();
      const mockedGet = vi.mocked(axios.get);

      mockedGet.mockImplementation((url) => {
        if (url.includes('/weight')) {
          return Promise.resolve({
            data: {
              data: {
                key: 'weight',
                category: 'weight',
                values: [{ timestamp: nowMs, value: '80kg' }],
                hasMore: false,
              },
            },
          }) as any;
        }
        if (url.includes('/bodyfat')) {
          return Promise.resolve({
            data: {
              data: {
                key: 'bodyfat',
                category: 'percentage',
                values: [{ timestamp: nowMs, value: '15%' }],
                hasMore: false,
              },
            },
          }) as any;
        }
        return Promise.resolve({
          data: {
            data: {
              key: 'other',
              category: 'length',
              values: [],
              hasMore: false,
            },
          },
        }) as any;
      });

      const result = await importMeasurementsFromLiftosaur(
        'user-1',
        'user-1',
        'test-key',
        'UTC',
        nowMs - 100000
      );

      expect(result).toEqual({ imported: 2, failedKeys: [], failedRecords: 0 });
      expect(measurementService.processHealthData).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'weight',
            value: 80,
            source: 'Liftosaur',
          }),
          expect.objectContaining({
            type: 'body_fat_percentage',
            value: 15,
            source: 'Liftosaur',
          }),
        ]),
        'user-1',
        'user-1'
      );
    });

    const mockKeyFailure = (failingKey: string, status: number) => {
      const nowMs = Date.now();
      vi.mocked(axios.get).mockImplementation((url) => {
        if (url.includes(`/${failingKey}`)) {
          return Promise.reject({
            message: `Request failed with status code ${status}`,
            response: { status },
          });
        }
        if (url.includes('/weight')) {
          return Promise.resolve(
            axiosOk({
              data: {
                key: 'weight',
                category: 'weight',
                values: [{ timestamp: nowMs, value: '80kg' }],
                hasMore: false,
              },
            })
          );
        }
        return Promise.resolve(
          axiosOk({ data: { key: 'other', values: [], hasMore: false } })
        );
      });
      return nowMs;
    };

    it('reports a key that fails with a server error and still saves the rest', async () => {
      const nowMs = mockKeyFailure('waist', 500);

      const result = await importMeasurementsFromLiftosaur(
        'user-1',
        'user-1',
        'test-key',
        'UTC',
        nowMs - 100000
      );

      expect(result).toEqual({
        imported: 1,
        failedKeys: ['waist'],
        failedRecords: 0,
      });
      expect(measurementService.processHealthData).toHaveBeenCalledWith(
        [expect.objectContaining({ type: 'weight', value: 80 })],
        'user-1',
        'user-1'
      );
    });

    it('does not report a key Liftosaur does not have (404)', async () => {
      const nowMs = mockKeyFailure('waist', 404);

      const result = await importMeasurementsFromLiftosaur(
        'user-1',
        'user-1',
        'test-key',
        'UTC',
        nowMs - 100000
      );

      expect(result).toEqual({ imported: 1, failedKeys: [], failedRecords: 0 });
    });

    it('counts only saved records and reports the ones processHealthData rejected', async () => {
      const nowMs = mockKeyFailure('waist', 404);
      vi.mocked(measurementService.processHealthData).mockResolvedValueOnce({
        message: 'Some health data entries could not be processed.',
        processed: [],
        errors: [{ error: 'insert failed', entry: {} }],
        skipped: [],
      } as never);

      const result = await importMeasurementsFromLiftosaur(
        'user-1',
        'user-1',
        'test-key',
        'UTC',
        nowMs - 100000
      );

      expect(result).toEqual({ imported: 0, failedKeys: [], failedRecords: 1 });
    });

    describe('measurement index', () => {
      const INDEX_URL = /\/api\/v1\/measurements$/;
      const page = (
        key: string,
        values: { timestamp: number; value: string }[]
      ) => Promise.resolve(axiosOk({ data: { key, values, hasMore: false } }));

      it('uses the API key names for limb measurements', async () => {
        const nowMs = Date.now();
        vi.mocked(axios.get).mockImplementation((url) => {
          if (INDEX_URL.test(url)) {
            return Promise.resolve(
              axiosOk({
                data: {
                  measurements: [
                    {
                      key: 'bicepRight',
                      latest: { timestamp: nowMs, value: '40cm' },
                    },
                    {
                      key: 'calfRight',
                      latest: { timestamp: nowMs, value: '38cm' },
                    },
                    {
                      key: 'thighRight',
                      latest: { timestamp: nowMs, value: '60cm' },
                    },
                    {
                      key: 'forearmRight',
                      latest: { timestamp: nowMs, value: '30cm' },
                    },
                  ],
                },
              })
            );
          }
          const key = url.split('/').pop()!;
          const values: Record<string, string> = {
            bicepRight: '40cm',
            calfRight: '38cm',
            thighRight: '60cm',
            forearmRight: '30cm',
          };
          return page(
            key,
            values[key] ? [{ timestamp: nowMs, value: values[key] }] : []
          );
        });

        const result = await importMeasurementsFromLiftosaur(
          'user-1',
          'user-1',
          'test-key',
          'UTC',
          nowMs - 100000
        );

        expect(result).toEqual({
          imported: 4,
          failedKeys: [],
          failedRecords: 0,
        });
        expect(measurementService.processHealthData).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ type: 'Biceps', value: 40 }),
            expect.objectContaining({ type: 'Calves', value: 38 }),
            expect.objectContaining({ type: 'Thighs', value: 60 }),
            expect.objectContaining({ type: 'Forearms', value: 30 }),
          ]),
          'user-1',
          'user-1'
        );
      });

      it('fetches only keys the index lists with values inside the window', async () => {
        const nowMs = Date.now();
        vi.mocked(axios.get).mockImplementation((url) => {
          if (INDEX_URL.test(url)) {
            return Promise.resolve(
              axiosOk({
                data: {
                  measurements: [
                    {
                      key: 'weight',
                      latest: { timestamp: nowMs, value: '80kg' },
                    },
                    {
                      key: 'waist',
                      latest: { timestamp: nowMs - 10_000_000, value: '90cm' },
                    },
                  ],
                },
              })
            );
          }
          return page('weight', [{ timestamp: nowMs, value: '80kg' }]);
        });

        await importMeasurementsFromLiftosaur(
          'user-1',
          'user-1',
          'test-key',
          'UTC',
          nowMs - 100000
        );

        const fetched = vi
          .mocked(axios.get)
          .mock.calls.map(([url]) => url)
          .filter((url) => !INDEX_URL.test(url));
        expect(fetched).toHaveLength(1);
        expect(fetched[0]).toMatch(/\/measurements\/weight$/);
      });

      it('fetches every supported key when the index request fails', async () => {
        const nowMs = Date.now();
        vi.mocked(axios.get).mockImplementation((url) => {
          if (INDEX_URL.test(url)) {
            return Promise.reject(new Error('timeout'));
          }
          return page('x', []);
        });

        await importMeasurementsFromLiftosaur(
          'user-1',
          'user-1',
          'test-key',
          'UTC',
          nowMs - 100000
        );

        // index + all 11 supported keys
        expect(vi.mocked(axios.get)).toHaveBeenCalledTimes(12);
      });

      it('does not fail the sync when Liftosaur rejects a key (400)', async () => {
        const nowMs = mockKeyFailure('waist', 400);

        const result = await importMeasurementsFromLiftosaur(
          'user-1',
          'user-1',
          'test-key',
          'UTC',
          nowMs - 100000
        );

        expect(result).toEqual({
          imported: 1,
          failedKeys: [],
          failedRecords: 0,
        });
      });
    });
  });
});
