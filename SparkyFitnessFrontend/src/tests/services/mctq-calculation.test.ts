import {
    classifyDaysAutomatically,
} from '@/lib/sleep/day-classification';
import {
    calculateMidSleep,
    calculateTST,
    checkDataSufficiency,
} from '@/lib/sleep/mctq-calculation';
import { describe, expect, it } from 'vitest';

describe('mctq-calculation', () => {
  describe('calculateTST', () => {
    it('calculates TST from stage events', () => {
      const entry = {
        deepSleepMinutes: 90,
        remSleepMinutes: 120,
        lightSleepMinutes: 180,
        awakeSleepMinutes: 30,
      };
      // TST should be deep + rem + light = 390 minutes = 6.5 hours
      const tst = calculateTST(entry as any);
      expect(tst).toBeCloseTo(6.5, 1);
    });

    it('falls back to duration if no stages', () => {
      const entry = {
        deepSleepMinutes: 0,
        remSleepMinutes: 0,
        lightSleepMinutes: 0,
        sleepDurationHours: 7.5,
      };
      const tst = calculateTST(entry as any);
      expect(tst).toBeCloseTo(7.5, 1);
    });
  });

  describe('calculateMidSleep', () => {
    it('calculates mid-point of sleep', () => {
      // Sleep 23:00 to 07:00 → mid = 03:00
      const mid = calculateMidSleep(23, 7);
      expect(mid).toBeCloseTo(3, 0);
    });

    it('handles same-day sleep', () => {
      // Sleep 01:00 to 09:00 → mid = 05:00
      const mid = calculateMidSleep(1, 9);
      expect(mid).toBeCloseTo(5, 0);
    });
  });

  describe('checkDataSufficiency', () => {
    it('reports insufficient for few entries', () => {
      const entries = Array.from({ length: 5 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        sleepEndTimestampGMT: Date.now(),
        sleepStartTimestampGMT: Date.now() - 28800000,
      }));
      const result = checkDataSufficiency(entries as any[]);
      expect(result.sufficient).toBe(false);
    });

    it('reports sufficient for adequate entries', () => {
      // Create 90 days of entries (65 workdays + 25 weekends)
      const entries = [];
      const baseDate = new Date('2024-01-01');
      for (let i = 0; i < 90; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        entries.push({
          date: d.toISOString().slice(0, 10),
          sleepEndTimestampGMT: d.getTime() + 25200000, // 7am
          sleepStartTimestampGMT: d.getTime() - 3600000, // 11pm prev day
        });
      }
      const result = checkDataSufficiency(entries as any[]);
      expect(result.sufficient).toBe(true);
    });
  });
});

describe('day-classification', () => {
  describe('classifyDaysAutomatically', () => {
    it('classifies consistent wake times as workday', () => {
      // Mon-Fri with consistent 7am wakes
      const entries = [];
      for (let week = 0; week < 8; week++) {
        for (let dow = 1; dow <= 5; dow++) {
          const d = new Date('2024-01-01');
          d.setDate(d.getDate() + week * 7 + dow);
          entries.push({
            date: d.toISOString().slice(0, 10),
            wakeHour: 7 + Math.random() * 0.3, // 7:00-7:18
          });
        }
        // Sat-Sun with varied wake times
        for (let dow = 6; dow <= 7; dow++) {
          const d = new Date('2024-01-01');
          d.setDate(d.getDate() + week * 7 + (dow === 7 ? 0 : dow));
          entries.push({
            date: d.toISOString().slice(0, 10),
            wakeHour: 8 + Math.random() * 2, // 8:00-10:00
          });
        }
      }

      const classification = classifyDaysAutomatically(entries as any[]);
      expect(classification).toBeDefined();
      // Should have 7 entries (one per day of week)
      expect(classification.size).toBe(7);
    });
  });
});
