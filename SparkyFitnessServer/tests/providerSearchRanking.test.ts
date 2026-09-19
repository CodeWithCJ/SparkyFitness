import { describe, expect, it } from 'vitest';
import {
  rankProviderMatches,
  type ProviderFoodItem,
} from '../services/providerFoodRanking.js';

// The rule already existed; #2418 is about where it runs. These pin what the
// manual search path now inherits, and the properties that make it safe to
// apply somewhere it was not applied before.

const food = (name: string, brand?: string): ProviderFoodItem => ({
  name,
  brand: brand ?? null,
});

const names = (foods: ProviderFoodItem[]) => foods.map((f) => f.name);

describe('provider result ranking (#2418)', () => {
  it('puts the plain whole food ahead of branded products', () => {
    const ranked = rankProviderMatches(
      [
        food('EGG (SNICKERS)', 'Snickers'),
        food('Egg, whole, raw, fresh'),
        food('EGG BITES', 'Starbucks'),
      ],
      'egg'
    );
    expect(names(ranked)[0]).toBe('Egg, whole, raw, fresh');
  });

  it("keeps the provider's own order within a tier", () => {
    // Nothing here outranks anything else, so the list must come back as it
    // went in: ranking is a reordering of what the provider decided, not a
    // replacement for it.
    const original = [
      food('Bread, white, commercially prepared'),
      food('Bread, whole-wheat, commercially prepared'),
      food('Bread, rye'),
    ];
    expect(names(rankProviderMatches(original, 'bread'))).toEqual(
      names(original)
    );
  });

  it('is idempotent, so ranking an already-ranked list changes nothing', () => {
    // searchProviderFoods now ranks what it returns, and the lookup cascade
    // ranks again when it picks one hit for the chatbot. That second pass has
    // to be a no-op rather than a reshuffle.
    const foods = [
      food("BANANA (BETTER'N PEANUT BUTTER)", "Better'n Peanut Butter"),
      food('Bananas, raw'),
      food('Banana chips', 'Trader Joe'),
    ];
    const once = rankProviderMatches(foods, 'banana');
    expect(names(rankProviderMatches(once, 'banana'))).toEqual(names(once));
  });

  it('handles the shapes a provider actually returns without throwing', () => {
    // Every provider funnels through this now, and they do not all agree on
    // what a result looks like.
    const odd = [
      { name: 'Milk, whole' },
      { name: 'MILK', brand: '   ' },
      { name: '' },
    ] as ProviderFoodItem[];
    expect(() => rankProviderMatches(odd, 'milk')).not.toThrow();
    expect(rankProviderMatches([], 'milk')).toEqual([]);
  });
});
