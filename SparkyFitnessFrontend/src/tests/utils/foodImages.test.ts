import {
  resolveFoodImageSrc,
  usableFoodImages,
  primaryImageOf,
  diaryEntryImageSrc,
} from '@/utils/foodImages';
import type { FoodEntry } from '@/types/food';

describe('resolveFoodImageSrc', () => {
  it('passes through absolute provider URLs so they hotlink', () => {
    expect(resolveFoodImageSrc('https://cdn.example.com/a.png')).toBe(
      'https://cdn.example.com/a.png'
    );
  });

  it('passes through server-relative upload paths unchanged', () => {
    expect(resolveFoodImageSrc('/uploads/foods/abc/1.png')).toBe(
      '/uploads/foods/abc/1.png'
    );
  });

  it('prefixes a bare filename with the foods upload directory', () => {
    expect(resolveFoodImageSrc('1.png')).toBe('/uploads/foods/1.png');
  });

  it.each([null, undefined, '', '   ', '[]'])(
    'treats %p as having no image',
    (value) => {
      expect(resolveFoodImageSrc(value)).toBeNull();
    }
  );
});

describe('usableFoodImages', () => {
  it('drops unusable entries and resolves the rest', () => {
    expect(
      usableFoodImages(['[]', '/uploads/foods/a/1.png', '', '2.png'])
    ).toEqual(['/uploads/foods/a/1.png', '/uploads/foods/2.png']);
  });

  it('returns an empty array when images is not an array', () => {
    expect(usableFoodImages(null)).toEqual([]);
    expect(usableFoodImages(undefined)).toEqual([]);
  });
});

describe('primaryImageOf', () => {
  it('returns the first usable image', () => {
    expect(primaryImageOf({ images: ['[]', '/uploads/foods/a/2.png'] })).toBe(
      '/uploads/foods/a/2.png'
    );
  });

  it('returns null when there are no images', () => {
    expect(primaryImageOf({ images: [] })).toBeNull();
    expect(primaryImageOf(null)).toBeNull();
  });
});

describe('diaryEntryImageSrc', () => {
  it('prefers the per-entry override over the food image', () => {
    const entry = {
      images: ['/uploads/food_entries/e1/override.png'],
      food_images: ['/uploads/foods/f1/default.png'],
    } as Partial<FoodEntry> as FoodEntry;

    expect(diaryEntryImageSrc(entry)).toBe(
      '/uploads/food_entries/e1/override.png'
    );
  });

  it("falls back to the parent food's image when there is no override", () => {
    const entry = {
      images: [],
      food_images: ['/uploads/foods/f1/default.png'],
    } as Partial<FoodEntry> as FoodEntry;

    expect(diaryEntryImageSrc(entry)).toBe('/uploads/foods/f1/default.png');
  });

  it('falls back to the nested food relation when food_images is absent', () => {
    const entry = {
      images: [],
      foods: { images: ['/uploads/foods/f1/nested.png'] },
    } as unknown as FoodEntry;

    expect(diaryEntryImageSrc(entry)).toBe('/uploads/foods/f1/nested.png');
  });

  it('returns null when neither the entry nor the food has an image', () => {
    const entry = { images: [] } as Partial<FoodEntry> as FoodEntry;

    expect(diaryEntryImageSrc(entry)).toBeNull();
    expect(diaryEntryImageSrc(null)).toBeNull();
  });
});
