import { supplementDoseScaling } from '@/pages/Medications/medicationUtils';

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (key: string, defaultValue?: string) => defaultValue || key },
}));

const supplement = {
  is_supplement: true,
  nutrients: { calories: 15, custom_nutrients: { 'Vitamin D': 25 } },
};

// Supplements are entered per SERVING, matching the label ("Serving Size 2 Tablets"), so
// the correct entry for such a bottle is the serving amounts at 1 serving. The helper's job
// is to catch the user who instead reads the field as tablets and logs 2.
describe('supplementDoseScaling', () => {
  it('reports the multiplication when the serving count is not 1', () => {
    expect(supplementDoseScaling(supplement, '2')).toEqual({
      dose: 2,
      calories: 15,
    });
  });

  it('says nothing at 1 serving, which is the correct entry for a 2-tablet label', () => {
    expect(supplementDoseScaling(supplement, '1')).toBeNull();
  });

  it('falls back to the medication dose when the override is blank', () => {
    // A blank override inherits, which is what the input's placeholder shows.
    expect(supplementDoseScaling(supplement, '', 2)).toEqual({
      dose: 2,
      calories: 15,
    });
    expect(supplementDoseScaling(supplement, '', 1)).toBeNull();
  });

  it('still warns when the supplement carries no calories', () => {
    // The doubling applies to every nutrient, not just energy, so a vitamin-only
    // supplement needs the same warning with a different sentence.
    // vitamin_c IS a fixed food_variants column; vitamin D is not, and lands in
    // custom_nutrients instead (covered by the next case).
    const vitaminOnly = { is_supplement: true, nutrients: { vitamin_c: 90 } };
    expect(supplementDoseScaling(vitaminOnly, '2')).toEqual({
      dose: 2,
      calories: null,
    });
  });

  it('covers custom nutrients, which are the common case for a supplement', () => {
    const customOnly = {
      is_supplement: true,
      nutrients: { custom_nutrients: { Boron: 3 } },
    };
    expect(supplementDoseScaling(customOnly, '2')).toEqual({
      dose: 2,
      calories: null,
    });
  });

  it('says nothing for a supplement with no nutrition entered', () => {
    expect(
      supplementDoseScaling({ is_supplement: true, nutrients: {} }, '2')
    ).toBeNull();
    expect(
      supplementDoseScaling({ is_supplement: true, nutrients: null }, '2')
    ).toBeNull();
  });

  it('says nothing for a plain medication', () => {
    expect(
      supplementDoseScaling(
        { is_supplement: false, nutrients: { calories: 15 } },
        '2'
      )
    ).toBeNull();
  });

  it('treats a non-positive or unparseable serving count as inherited, not as 1', () => {
    // handleSave sends positiveDoseOrNull, so these save as null and inherit the
    // medication's own value. With nothing to inherit the preview stays quiet rather than
    // rendering "0 servings" at the user mid-keystroke.
    expect(supplementDoseScaling(supplement, '0')).toBeNull();
    expect(supplementDoseScaling(supplement, '-2')).toBeNull();
    expect(supplementDoseScaling(supplement, 'abc')).toBeNull();
  });

  it('previews the inherited value for an invalid override, matching what gets logged', () => {
    // The regression: an invalid override behaves exactly like an empty one at save time,
    // so previewing 1 would disagree with the entry once the inherited dose is above 1.
    expect(supplementDoseScaling(supplement, '0', 2)).toEqual({
      dose: 2,
      calories: 15,
    });
    expect(supplementDoseScaling(supplement, 'abc', 2)).toEqual({
      dose: 2,
      calories: 15,
    });
  });

  it('handles a fractional dose, which a half tablet legitimately is', () => {
    expect(supplementDoseScaling(supplement, '0.5')).toEqual({
      dose: 0.5,
      calories: 15,
    });
  });
});
