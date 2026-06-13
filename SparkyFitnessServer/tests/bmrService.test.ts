import { describe, expect, test, vi } from 'vitest';
import { ActivityMultiplier } from '../services/bmrService.js';

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

describe('bmrService ActivityMultiplier', () => {
  // Regression guard: the adaptive-mode fallback TDEE looks up activity levels in this
  // map (AdaptiveTdeeService uses bmrService.ActivityMultiplier[level] || 1.2). If "none"
  // were missing it would silently fall back to 1.2 (Sedentary) instead of 1.0.
  test('"none" resolves to a 1.0 multiplier', () => {
    expect(ActivityMultiplier.none).toBe(1.0);
  });

  test('keeps existing multipliers intact', () => {
    expect(ActivityMultiplier.not_much).toBe(1.2);
    expect(ActivityMultiplier.very_active).toBe(1.725);
  });
});
