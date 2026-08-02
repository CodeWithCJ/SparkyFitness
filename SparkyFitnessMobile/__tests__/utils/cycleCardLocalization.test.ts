import { BABY_DEVELOPMENT } from '@workspace/shared';
import {
  getBabyComparisonLabel,
  getCycleCardModeTitle,
  getCycleCardPhaseLabel,
} from '../../src/utils/cycleCardLocalization';

const EXPECTED_COMPARISON_KEYS = {
  'A poppy seed': 'cycleCard.babyComparison.poppySeed',
  'A sesame seed': 'cycleCard.babyComparison.sesameSeed',
  'A lentil': 'cycleCard.babyComparison.lentil',
  'A blueberry': 'cycleCard.babyComparison.blueberry',
  'A raspberry': 'cycleCard.babyComparison.raspberry',
  'A cherry': 'cycleCard.babyComparison.cherry',
  'A strawberry': 'cycleCard.babyComparison.strawberry',
  'A lime': 'cycleCard.babyComparison.lime',
  'A plum': 'cycleCard.babyComparison.plum',
  'A peapod': 'cycleCard.babyComparison.peapod',
  'A lemon': 'cycleCard.babyComparison.lemon',
  'An apple': 'cycleCard.babyComparison.apple',
  'An avocado': 'cycleCard.babyComparison.avocado',
  'A turnip': 'cycleCard.babyComparison.turnip',
  'A bell pepper': 'cycleCard.babyComparison.bellPepper',
  'A mango': 'cycleCard.babyComparison.mango',
  'A banana': 'cycleCard.babyComparison.banana',
  'A carrot': 'cycleCard.babyComparison.carrot',
  'A spaghetti squash': 'cycleCard.babyComparison.spaghettiSquash',
  'A large mango': 'cycleCard.babyComparison.largeMango',
  'An ear of corn': 'cycleCard.babyComparison.earOfCorn',
  'A rutabaga': 'cycleCard.babyComparison.rutabaga',
  'A scallion bunch': 'cycleCard.babyComparison.scallionBunch',
  'A cauliflower': 'cycleCard.babyComparison.cauliflower',
  'An eggplant': 'cycleCard.babyComparison.eggplant',
  'A butternut squash': 'cycleCard.babyComparison.butternutSquash',
  'A large cabbage': 'cycleCard.babyComparison.largeCabbage',
  'A coconut': 'cycleCard.babyComparison.coconut',
  'A jicama': 'cycleCard.babyComparison.jicama',
  'A pineapple': 'cycleCard.babyComparison.pineapple',
  'A cantaloupe': 'cycleCard.babyComparison.cantaloupe',
  'A honeydew melon': 'cycleCard.babyComparison.honeydewMelon',
  'A head of romaine': 'cycleCard.babyComparison.headOfRomaine',
  'A bunch of Swiss chard': 'cycleCard.babyComparison.swissChard',
  'A leek': 'cycleCard.babyComparison.leek',
  'A mini watermelon': 'cycleCard.babyComparison.miniWatermelon',
  'A small pumpkin': 'cycleCard.babyComparison.smallPumpkin',
} as const;

const t = (key: string): string => key;

describe('cycle card localization', () => {
  it('keeps the helper mapping complete with BABY_DEVELOPMENT', () => {
    expect(BABY_DEVELOPMENT.map((entry) => entry.comparison).sort()).toEqual(
      Object.keys(EXPECTED_COMPARISON_KEYS).sort(),
    );
    for (const [comparison, expectedKey] of Object.entries(EXPECTED_COMPARISON_KEYS)) {
      expect(getBabyComparisonLabel(t, comparison)).toBe(expectedKey);
    }
  });

  it('preserves unknown comparisons as a literal fallback', () => {
    expect(getBabyComparisonLabel(t, 'future comparison')).toBe('future comparison');
  });

  it('maps every mode, including discreet wellness mode', () => {
    expect(getCycleCardModeTitle(t, 'pregnant')).toBe('cycleCard.title.pregnancy');
    expect(getCycleCardModeTitle(t, 'ttc')).toBe('cycleCard.title.fertility');
    expect(getCycleCardModeTitle(t, 'postpartum')).toBe('cycleCard.title.postpartum');
    expect(getCycleCardModeTitle(t, 'menopause')).toBe('cycleCard.title.menopause');
    expect(getCycleCardModeTitle(t, 'standard')).toBe('cycleCard.title.cycle');
    expect(getCycleCardModeTitle(t, 'unknown')).toBe('cycleCard.title.cycleAndPregnancy');
    expect(getCycleCardModeTitle(t, 'pregnant', true)).toBe('cycleCard.title.wellness');
  });

  it('maps every phase, including the discreet active fallback', () => {
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
    expect(getCycleCardPhaseLabel(t, 'ovulation', true)).toBe('cycleCard.phase.active');
  });
});
