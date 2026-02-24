import {
    calculateDayWeight,
    calculatePaybackNights,
    calculateSleepDebt,
    createDebtEntry,
    getDebtCategoryLabel,
} from '@/lib/sleep/sleep-debt';
import { describe, expect, it } from 'vitest';

describe('sleep-debt', () => {
  describe('calculateDayWeight', () => {
    it('returns 1 for day 0 (today)', () => {
      expect(calculateDayWeight(0)).toBe(1);
    });

    it('returns decayed value for older days', () => {
      const w1 = calculateDayWeight(1);
      const w2 = calculateDayWeight(2);
      expect(w1).toBeGreaterThan(0);
      expect(w1).toBeLessThan(1);
      expect(w2).toBeLessThan(w1);
    });

    it('approaches zero for very old days', () => {
      const w14 = calculateDayWeight(14);
      expect(w14).toBeLessThan(0.01);
    });
  });

  describe('calculatePaybackNights', () => {
    it('returns 0 for zero debt', () => {
      expect(calculatePaybackNights(0)).toBe(0);
    });

    it('returns 0 for negative debt (surplus)', () => {
      expect(calculatePaybackNights(-1)).toBe(0);
    });

    it('returns ceiling of debt hours', () => {
      expect(calculatePaybackNights(2.3)).toBe(3);
      expect(calculatePaybackNights(5)).toBe(5);
    });
  });

  describe('getDebtCategoryLabel', () => {
    it('classifies zero debt as low', () => {
      expect(getDebtCategoryLabel(0)).toBe('low');
    });

    it('classifies moderate debt correctly', () => {
      expect(getDebtCategoryLabel(3)).toBe('moderate');
    });

    it('classifies high debt correctly', () => {
      expect(getDebtCategoryLabel(6)).toBe('high');
    });

    it('classifies critical debt correctly', () => {
      expect(getDebtCategoryLabel(10)).toBe('critical');
    });
  });

  describe('createDebtEntry', () => {
    it('creates a valid debt entry', () => {
      const entry = createDebtEntry('2024-01-15', 7.5, 8.25);
      expect(entry.date).toBe('2024-01-15');
      expect(entry.actual).toBe(7.5);
      expect(entry.needed).toBe(8.25);
      expect(entry.debt).toBeCloseTo(0.75);
    });

    it('caps negative debt at 0', () => {
      const entry = createDebtEntry('2024-01-15', 9, 8);
      expect(entry.debt).toBe(0);
    });
  });

  describe('calculateSleepDebt', () => {
    it('returns zero debt for empty history', () => {
      const result = calculateSleepDebt([], 8);
      expect(result.currentDebt).toBe(0);
      expect(result.category).toBe('low');
    });

    it('calculates debt correctly for consistent deficit', () => {
      // 7 days of sleeping 7h with 8h need = 1h deficit each day
      const history = Array.from({ length: 7 }, (_, i) => ({
        date: `2024-01-${String(15 - i).padStart(2, '0')}`,
        actual: 7,
        needed: 8,
        debt: 1,
      }));
      const result = calculateSleepDebt(history, 8);
      expect(result.currentDebt).toBeGreaterThan(0);
    });

    it('calculates trend direction', () => {
      // Improving: recent 7 days better than older 7
      const improving = Array.from({ length: 14 }, (_, i) => ({
        date: `2024-01-${String(15 - i).padStart(2, '0')}`,
        actual: i < 7 ? 8.5 : 6.5,
        needed: 8,
        debt: i < 7 ? 0 : 1.5,
      }));
      const result = calculateSleepDebt(improving, 8);
      expect(result.trend.direction).toBe('improving');
    });
  });
});
