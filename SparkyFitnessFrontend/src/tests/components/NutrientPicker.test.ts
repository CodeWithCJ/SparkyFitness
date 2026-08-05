import {
  collectClaimedNutrientNames,
  isNutrientOptionAlreadyAdded,
} from '@/pages/Medications/medicationUtils';
import type { UserCustomNutrient } from '@/types/customNutrient';

const customNutrient = (
  name: string,
  aliases: string[] = []
): UserCustomNutrient => ({
  id: name,
  user_id: 'u1',
  name,
  unit: 'mg',
  aliases,
  created_at: '',
  updated_at: '',
});

const catalogOption = (
  label: string,
  catalogId: string,
  fieldKey?: string
) => ({
  label,
  catalogId,
  fieldKey,
});

describe('collectClaimedNutrientNames', () => {
  it('claims each selected key plus the aliases of the nutrient behind it', () => {
    const claimed = collectClaimedNutrientNames(
      ['Vit D'],
      [customNutrient('Vit D', ['Vitamin D3'])]
    );

    expect(claimed.has('vit d')).toBe(true);
    expect(claimed.has('vitamin d3')).toBe(true);
  });

  it('tolerates a selected key with no matching custom nutrient', () => {
    const claimed = collectClaimedNutrientNames(['protein'], []);
    expect(claimed.has('protein')).toBe(true);
  });
});

describe('isNutrientOptionAlreadyAdded', () => {
  it('hides an option whose row is already in the editor', () => {
    const selected = ['Magnesium'];
    const claimed = collectClaimedNutrientNames(selected, [
      customNutrient('Magnesium'),
    ]);

    expect(
      isNutrientOptionAlreadyAdded(
        catalogOption('Magnesium', 'magnesium'),
        selected,
        claimed
      )
    ).toBe(true);
  });

  it('hides a catalog option the user already tracks under their own spelling', () => {
    // The user has "Vit D" with the alias "Vitamin D3". The server would resolve a pick
    // of catalog "Vitamin D" onto that same row, so adding it would be a silent no-op —
    // the picker must not offer it.
    const selected = ['Vit D'];
    const claimed = collectClaimedNutrientNames(selected, [
      customNutrient('Vit D', ['Vitamin D3']),
    ]);

    expect(
      isNutrientOptionAlreadyAdded(
        catalogOption('Vitamin D', 'vitamin_d'),
        selected,
        claimed
      )
    ).toBe(true);
  });

  it('still offers an unrelated nutrient', () => {
    const selected = ['Vit D'];
    const claimed = collectClaimedNutrientNames(selected, [
      customNutrient('Vit D', ['Vitamin D3']),
    ]);

    expect(
      isNutrientOptionAlreadyAdded(
        catalogOption('Zinc', 'zinc'),
        selected,
        claimed
      )
    ).toBe(false);
  });

  it('hides a fixed-field option already held under its column name', () => {
    const selected = ['vitamin_c'];
    const claimed = collectClaimedNutrientNames(selected, []);

    expect(
      isNutrientOptionAlreadyAdded(
        catalogOption('Vitamin C', 'vitamin_c', 'vitamin_c'),
        selected,
        claimed
      )
    ).toBe(true);
  });
});
