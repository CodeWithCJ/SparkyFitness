import { describe, expect, it } from 'vitest';
import {
  rankProviderMatches,
  type ProviderFoodItem,
} from '../utils/foodRanking.js';

const names = (foods: ProviderFoodItem[]) => foods.map((food) => food.name);

// The ranking before brand matching, kept here to pin that plain food searches
// still rank exactly as they did.
const previousRanking = (foods: ProviderFoodItem[], query: string) => {
  const q = query.trim().toLowerCase();
  const qStem = q.replace(/s$/, '');
  const score = (f: ProviderFoodItem) => {
    const name = String(f.name ?? '').toLowerCase();
    const branded = Boolean(f.brand && String(f.brand).trim());
    const firstSegment = name.split(',')[0].trim();
    let s = branded ? 0 : 100;
    if (firstSegment === q || firstSegment === qStem) s += 20;
    else if (firstSegment.startsWith(qStem)) s += 10;
    else if (name.includes(q)) s += 5;
    return s;
  };
  return foods
    .map((f, i) => ({ f, i, s: score(f) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.f);
};

describe('rankProviderMatches', () => {
  it('ranks plain food searches exactly as before', () => {
    // What a provider returns for each search: every result is about it.
    const searches: Record<string, ProviderFoodItem[]> = {
      banana: [
        { name: 'BANANA', brand: "BETTER'N PEANUT BUTTER" },
        { name: 'Banana, raw', brand: null },
        { name: 'Sunscreen Lotion', brand: 'Banana Boat' },
        { name: 'Banana chips', brand: '' },
      ],
      egg: [
        { name: 'EGG', brand: 'SNICKERS' },
        { name: 'Egg, whole, raw, fresh', brand: '' },
        { name: 'Large Eggs', brand: "Eggland's Best" },
      ],
      'chicken breast': [
        { name: 'Chicken Breast (Value Pack)', brand: 'Acme Foods' },
        { name: 'Chicken Breast', brand: '' },
        { name: 'Chicken Breast Chunks', brand: 'Chicken of the Sea' },
        {
          name: 'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
          brand: null,
        },
      ],
      'grilled chicken breast': [
        { name: 'Grilled Chicken Breast Strips', brand: 'Tyson' },
        {
          name: 'Chicken, broilers or fryers, breast, meat only, cooked, grilled',
          brand: null,
        },
      ],
      'greek yogurt': [
        { name: 'Greek Yogurt, Plain', brand: 'Chobani' },
        { name: 'Yogurt, Greek, plain, nonfat', brand: null },
      ],
      'apple juice': [
        { name: 'Apple juice', brand: 'Apple' },
        { name: 'Apple juice, canned or bottled, unsweetened', brand: null },
      ],
      'brown rice': [
        { name: 'Brown Rice', brand: 'Uncle Bens' },
        { name: 'Rice, brown, long-grain, cooked', brand: null },
      ],
      oatmeal: [
        { name: 'Instant Oatmeal', brand: 'Quaker' },
        {
          name: 'Cereals, oats, regular and quick, not fortified, dry',
          brand: null,
        },
      ],
      'organic milk': [
        { name: 'Milk, whole, 3.25% milkfat', brand: null },
        { name: 'Organic milk', brand: 'Organic' },
      ],
    };

    for (const [query, foods] of Object.entries(searches)) {
      expect(names(rankProviderMatches(foods, query)), query).toEqual(
        names(previousRanking(foods, query))
      );
    }
  });

  it('counts a plural name as an exact match for a singular search', () => {
    const ranked = rankProviderMatches(
      [
        { name: 'Apple juice', brand: 'Apple & Eve' },
        { name: 'Apples, raw, with skin', brand: null },
        { name: 'Apples', brand: 'Apple Country' },
      ],
      'apple'
    );

    expect(names(ranked)).toEqual([
      'Apples, raw, with skin',
      'Apples',
      'Apple juice',
    ]);
  });

  it('ranks a product whose brand the query names above unbranded items', () => {
    const ranked = rankProviderMatches(
      [
        { name: 'Kirkland', brand: '' },
        { name: 'Mélange espresso - Kirkland', brand: '' },
        { name: 'Everything Bagel', brand: 'Kirkland Signature' },
        { name: 'Organic Coffee', brand: 'Kirkland' },
      ],
      'kirkland bagel'
    );

    expect(names(ranked)[0]).toBe('Everything Bagel');
  });

  it('matches the brand words whatever the order or plural', () => {
    const ranked = rankProviderMatches(
      [
        { name: 'kirkland', brand: '' },
        { name: 'Parmesan bagels', brand: 'Kirkland' },
      ],
      'Bagel, Kirkland'
    );

    expect(names(ranked)[0]).toBe('Parmesan bagels');
  });

  it('matches a brand the product name repeats', () => {
    const ranked = rankProviderMatches(
      [
        { name: "Spinach Dip - Trader Joe's - Trader Joe's", brand: '' },
        { name: "Trader joe's, sriracha hummus", brand: "Trader Joe's" },
        { name: 'Trader Joe’s Hummus Dip', brand: 'Trader Joe’s' },
      ],
      "Trader Joe's hummus"
    );

    expect(names(ranked)).toEqual([
      "Trader joe's, sriracha hummus",
      'Trader Joe’s Hummus Dip',
      "Spinach Dip - Trader Joe's - Trader Joe's",
    ]);
  });

  it('gives no whole-food bonus to an unbranded result that shares no word with the query', () => {
    const ranked = rankProviderMatches(
      [
        { name: 'Chaussons aux pommes U x2', brand: '' },
        { name: 'Apple & eve, 100% juice, apple', brand: 'Apple & Eve' },
        { name: 'Apples', brand: '' },
      ],
      'apple'
    );

    expect(names(ranked)).toEqual([
      'Apples',
      'Apple & eve, 100% juice, apple',
      'Chaussons aux pommes U x2',
    ]);
  });

  it('keeps the whole food first when the brand shares a word with the name', () => {
    const ranked = rankProviderMatches(
      [
        { name: 'Chicken Breast Chunks', brand: 'Chicken of the Sea' },
        {
          name: 'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
          brand: null,
        },
      ],
      'chicken breast'
    );

    expect(names(ranked)[0]).toBe(
      'Chicken, broilers or fryers, breast, meat only, cooked, roasted'
    );
  });

  it('keeps the whole food first when the query is only a brand word', () => {
    const ranked = rankProviderMatches(
      [
        { name: 'Sunscreen Lotion', brand: 'Banana Boat' },
        { name: 'Bananas, raw', brand: null },
      ],
      'banana'
    );

    expect(names(ranked)).toEqual(['Bananas, raw', 'Sunscreen Lotion']);
  });

  it('does not treat a brand match as one when another query word is missing from the name', () => {
    const ranked = rankProviderMatches(
      [
        { name: 'Organic Coffee', brand: 'Kirkland' },
        { name: 'Bagel', brand: '' },
      ],
      'kirkland bagel'
    );

    expect(names(ranked)).toEqual(['Bagel', 'Organic Coffee']);
  });
});
