import {
    addHours,
    calculateEnergy,
    calculateProcessC,
    calculateProcessS,
    hoursToTimeString,
    median,
    medianTime,
} from '@/lib/sleep/circadian-math';
import { describe, expect, it } from 'vitest';

describe('circadian-math', () => {
  describe('calculateProcessS', () => {
    it('starts low after waking', () => {
      const s = calculateProcessS(0); // 0 hours awake
      expect(s).toBeLessThan(0.3);
    });

    it('increases with hours awake', () => {
      const s0 = calculateProcessS(0);
      const s8 = calculateProcessS(8);
      const s16 = calculateProcessS(16);
      expect(s8).toBeGreaterThan(s0);
      expect(s16).toBeGreaterThan(s8);
    });

    it('approaches upper asymptote', () => {
      const s20 = calculateProcessS(20);
      expect(s20).toBeGreaterThan(0.7);
      expect(s20).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateProcessC', () => {
    it('returns value between 0 and 1', () => {
      for (let h = 0; h < 24; h += 0.5) {
        const c = calculateProcessC(h, 4); // nadir at 4am
        expect(c).toBeGreaterThanOrEqual(-0.1); // allow small float tolerance
        expect(c).toBeLessThanOrEqual(1.1);
      }
    });

    it('is near minimum at nadir hour', () => {
      const atNadir = calculateProcessC(4, 4);
      const atAcrophase = calculateProcessC(16, 4); // 12h after nadir
      expect(atNadir).toBeLessThan(atAcrophase);
    });
  });

  describe('calculateEnergy', () => {
    it('returns energy between 0 and 100', () => {
      const energy = calculateEnergy(0.3, 0.7);
      expect(energy).toBeGreaterThanOrEqual(0);
      expect(energy).toBeLessThanOrEqual(100);
    });
  });

  describe('median', () => {
    it('returns single value for single element', () => {
      expect(median([5])).toBe(5);
    });

    it('returns middle for odd count', () => {
      expect(median([1, 3, 5])).toBe(3);
    });

    it('returns average of middle two for even count', () => {
      expect(median([1, 2, 3, 4])).toBe(2.5);
    });

    it('handles unsorted input', () => {
      expect(median([5, 1, 3])).toBe(3);
    });
  });

  describe('medianTime', () => {
    it('calculates median of time values', () => {
      const times = [7.0, 7.5, 8.0]; // 7am, 7:30am, 8am
      const result = medianTime(times);
      expect(result).toBeCloseTo(7.5);
    });
  });

  describe('addHours', () => {
    it('wraps around 24h', () => {
      expect(addHours(23, 3)).toBeCloseTo(2);
    });

    it('handles negative result', () => {
      expect(addHours(2, -5)).toBeCloseTo(21);
    });
  });

  describe('hoursToTimeString', () => {
    it('formats correctly', () => {
      expect(hoursToTimeString(7.5)).toBe('07:30');
      expect(hoursToTimeString(13.25)).toBe('13:15');
      expect(hoursToTimeString(0)).toBe('00:00');
      expect(hoursToTimeString(23.75)).toBe('23:45');
    });
  });
});
