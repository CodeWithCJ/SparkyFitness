import {
  MACRO_FIELD_KEYS,
  isMacroField,
  hasMacroValue,
} from '@/pages/Medications/medicationUtils';
import { resolveMacroFieldKey } from '@workspace/shared';

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (key: string, defaultValue?: string) => defaultValue || key },
}));

describe('macro field helpers', () => {
  it('covers exactly the five fields the server rolls up', () => {
    expect([...MACRO_FIELD_KEYS].sort()).toEqual([
      'calories',
      'carbs',
      'dietary_fiber',
      'fat',
      'protein',
    ]);
  });

  it('recognises a macro field and rejects a micronutrient', () => {
    expect(isMacroField('calories')).toBe(true);
    expect(isMacroField('dietary_fiber')).toBe(true);
    // vitamin_c IS a fixed food-variant column, but it belongs to the picker, not the block.
    expect(isMacroField('vitamin_c')).toBe(false);
    expect(isMacroField('Magnesium')).toBe(false);
  });

  it('opens the block expanded only when a macro value was saved', () => {
    // Decides the editor's initial state: a vitamin-only supplement must not greet the
    // user with five empty macro fields.
    expect(hasMacroValue({ calories: 15 })).toBe(true);
    expect(hasMacroValue({ dietary_fiber: 0.5 })).toBe(true);
    expect(hasMacroValue({ vitamin_c: 90 })).toBe(false);
    expect(hasMacroValue({ custom_nutrients: { 'Vitamin D': 25 } })).toBe(
      false
    );
    expect(hasMacroValue({})).toBe(false);
    expect(hasMacroValue(null)).toBe(false);
    expect(hasMacroValue(undefined)).toBe(false);
  });

  it('treats a zero as a saved value, since a label can print 0 kcal', () => {
    expect(hasMacroValue({ calories: 0 })).toBe(true);
  });

  // The five are absent from the picker's list, so the free-text control is the only way
  // to name one there. Anything this fails to resolve becomes a custom nutrient that no
  // rollup reads: a value the user typed that then counts toward nothing.
  it('resolves a free-text macro name by label, column, short label and alias', () => {
    expect(resolveMacroFieldKey('Calories')).toBe('calories');
    expect(resolveMacroFieldKey('energy')).toBe('calories');
    expect(resolveMacroFieldKey('Total Carbohydrate')).toBe('carbs');
    expect(resolveMacroFieldKey('carbohydrate')).toBe('carbs');
    expect(resolveMacroFieldKey('dietary_fiber')).toBe('dietary_fiber');
    expect(resolveMacroFieldKey('Fibre')).toBe('dietary_fiber');
    expect(resolveMacroFieldKey('Fiber')).toBe('dietary_fiber');
    expect(resolveMacroFieldKey('total fat')).toBe('fat');
  });

  it('leaves a genuine custom nutrient alone', () => {
    expect(resolveMacroFieldKey('Ashwagandha')).toBeNull();
    // A picker micronutrient must keep going through the catalog, not the macro block.
    expect(resolveMacroFieldKey('Vitamin C')).toBeNull();
    expect(resolveMacroFieldKey('')).toBeNull();
  });

  it('does not claim calories from fat, which is a component and not the total', () => {
    // Filing a fat-only figure as the serving's energy would overstate the day's calories.
    expect(resolveMacroFieldKey('calories from fat')).toBeNull();
  });
});
