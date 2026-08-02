import {
  getBabyComparisonLabel,
  getCycleCardModeTitle,
  getCycleCardPhaseLabel,
} from '../../src/utils/cycleCardLocalization';

const t = (key: string, options?: Record<string, unknown>): string =>
  options ? `${key}:${JSON.stringify(options)}` : key;

describe('cycle card localization', () => {
  it('maps every supported mode and discreet title', () => {
    expect(getCycleCardModeTitle(t, 'pregnant')).toBe('cycleCard.title.pregnancy');
    expect(getCycleCardModeTitle(t, 'ttc')).toBe('cycleCard.title.fertility');
    expect(getCycleCardModeTitle(t, 'postpartum')).toBe('cycleCard.title.postpartum');
    expect(getCycleCardModeTitle(t, 'menopause')).toBe('cycleCard.title.menopause');
    expect(getCycleCardModeTitle(t, 'standard')).toBe('cycleCard.title.cycle');
    expect(getCycleCardModeTitle(t, 'unknown')).toBe('cycleCard.title.cycleAndPregnancy');
    expect(getCycleCardModeTitle(t, 'pregnant', true)).toBe('cycleCard.title.wellness');
  });

  it('maps every cycle phase and preserves unknown comparisons', () => {
    expect(['menstrual', 'follicular', 'fertile', 'ovulation', 'luteal'].map((phase) =>
      getCycleCardPhaseLabel(t, phase),
    )).toEqual([
      'cycleCard.phase.menstrual',
      'cycleCard.phase.follicular',
      'cycleCard.phase.fertile',
      'cycleCard.phase.ovulation',
      'cycleCard.phase.luteal',
    ]);
    expect(getCycleCardPhaseLabel(t, 'unknown')).toBe('cycleCard.phase.active');
    expect(getBabyComparisonLabel(t, 'A poppy seed')).toBe('cycleCard.babyComparison.poppySeed');
    expect(getBabyComparisonLabel(t, 'future comparison')).toBe('future comparison');
  });
});
