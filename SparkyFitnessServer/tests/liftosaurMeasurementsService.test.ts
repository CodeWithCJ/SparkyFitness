import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  parseLiftosaurValue,
  importMeasurementsFromLiftosaur,
  exportMeasurementsToLiftosaur,
} from '../integrations/liftosaur/liftosaurMeasurementsService.js';
import measurementService from '../services/measurementService.js';
import measurementRepository from '../models/measurementRepository.js';

vi.mock('axios');
vi.mock('../services/measurementService.js');
vi.mock('../models/measurementRepository.js');
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

describe('liftosaurMeasurementsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      const count = await importMeasurementsFromLiftosaur(
        'user-1',
        'user-1',
        'test-key',
        'UTC',
        nowMs - 100000
      );

      expect(count).toBe(2);
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
  });

  describe('exportMeasurementsToLiftosaur', () => {
    it('exports check-in measurements to Liftosaur endpoints', async () => {
      const mockedCheckIns = [
        {
          entry_date: '2026-03-01',
          weight: 80,
          body_fat_percentage: 15,
          neck: 38,
          waist: 82,
          hips: 95,
        },
      ];

      vi.mocked(
        measurementService.getCheckInMeasurementsByDateRange
      ).mockResolvedValue(mockedCheckIns as any);
      vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue(
        []
      );

      const mockedPost = vi.mocked(axios.post);
      mockedPost.mockResolvedValue({ status: 201 } as any);

      const exported = await exportMeasurementsToLiftosaur(
        'user-1',
        'test-key',
        'UTC',
        '2026-03-01',
        '2026-03-01'
      );

      expect(exported).toBe(5); // weight, bodyfat, neck, waist, hips
      expect(mockedPost).toHaveBeenCalledWith(
        expect.stringContaining('/weight'),
        expect.objectContaining({ value: '80kg' }),
        expect.any(Object)
      );
      expect(mockedPost).toHaveBeenCalledWith(
        expect.stringContaining('/bodyfat'),
        expect.objectContaining({ value: '15%' }),
        expect.any(Object)
      );
    });
  });
});
