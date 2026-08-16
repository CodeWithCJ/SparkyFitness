import {
  normalizeFoodImagePath,
  usableFoodImages,
  primaryImageOf,
  externalFoodImage,
  diaryEntryImages,
  diaryEntryImage,
  loggedMealImages,
  loggedMealImage,
} from '../../src/utils/foodImages';

describe('normalizeFoodImagePath', () => {
  it('keeps server-relative and absolute paths as-is', () => {
    expect(normalizeFoodImagePath('/uploads/foods/abc/0.jpg')).toBe(
      '/uploads/foods/abc/0.jpg',
    );
    expect(normalizeFoodImagePath('https://cdn.example/x.jpg')).toBe(
      'https://cdn.example/x.jpg',
    );
  });

  it('treats empty-ish values as no image', () => {
    expect(normalizeFoodImagePath(null)).toBeNull();
    expect(normalizeFoodImagePath(undefined)).toBeNull();
    expect(normalizeFoodImagePath('')).toBeNull();
    expect(normalizeFoodImagePath('   ')).toBeNull();
  });

  it('treats the legacy "[]" payload as no image', () => {
    // Older rows serialized an empty image list as the literal string "[]";
    // rendering it would request /uploads/foods/[] and 404.
    expect(normalizeFoodImagePath('[]')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeFoodImagePath('  /uploads/foods/a/1.png  ')).toBe(
      '/uploads/foods/a/1.png',
    );
  });
});

describe('usableFoodImages', () => {
  it('drops unusable entries but keeps order', () => {
    expect(
      usableFoodImages(['', '/uploads/foods/a/1.jpg', '[]', 'https://x/2.jpg']),
    ).toEqual(['/uploads/foods/a/1.jpg', 'https://x/2.jpg']);
  });

  it('returns an empty array for non-array input', () => {
    expect(usableFoodImages(null)).toEqual([]);
    expect(usableFoodImages(undefined)).toEqual([]);
  });
});

describe('primaryImageOf', () => {
  it('returns the first usable image', () => {
    expect(primaryImageOf({ images: ['[]', '/uploads/foods/a/2.jpg'] })).toBe(
      '/uploads/foods/a/2.jpg',
    );
  });

  it('returns null when there is nothing to show', () => {
    expect(primaryImageOf({ images: [] })).toBeNull();
    expect(primaryImageOf(null)).toBeNull();
  });
});

describe('externalFoodImage', () => {
  it('prefers an already-imported images array', () => {
    expect(
      externalFoodImage({
        images: ['/uploads/foods/a/1.jpg'],
        image_source_url: 'https://x/full.jpg',
        image_url: 'https://x/thumb.jpg',
      }),
    ).toBe('/uploads/foods/a/1.jpg');
  });

  it('prefers the full-size source over the search thumbnail', () => {
    expect(
      externalFoodImage({
        image_source_url: 'https://x/full.jpg',
        image_url: 'https://x/thumb.jpg',
      }),
    ).toBe('https://x/full.jpg');
  });

  it('falls back to the thumbnail when there is no full-size variant', () => {
    expect(externalFoodImage({ image_url: 'https://x/thumb.jpg' })).toBe(
      'https://x/thumb.jpg',
    );
  });

  it('returns null when the provider supplied no photo', () => {
    expect(externalFoodImage({})).toBeNull();
    expect(externalFoodImage(null)).toBeNull();
  });
});

describe('diaryEntryImages', () => {
  it('prefers the per-entry override over the parent food', () => {
    expect(
      diaryEntryImages({
        images: ['/uploads/food_entries/e/1.jpg'],
        food_images: ['/uploads/foods/f/1.jpg'],
      }),
    ).toEqual(['/uploads/food_entries/e/1.jpg']);
  });

  it('falls back to the parent food when there is no override', () => {
    // The override is never written back to the parent, so this fallback is
    // what makes an un-overridden entry still show a picture.
    expect(
      diaryEntryImages({ images: [], food_images: ['/uploads/foods/f/1.jpg'] }),
    ).toEqual(['/uploads/foods/f/1.jpg']);
  });

  it('ignores an override that holds only unusable values', () => {
    expect(
      diaryEntryImages({
        images: ['[]'],
        food_images: ['/uploads/foods/f/1.jpg'],
      }),
    ).toEqual(['/uploads/foods/f/1.jpg']);
  });

  it('returns nothing when neither side has an image', () => {
    expect(diaryEntryImages({ images: null, food_images: null })).toEqual([]);
    expect(diaryEntryImage(null)).toBeNull();
  });
});

describe('loggedMealImages', () => {
  it('prefers the entry override over the meal template', () => {
    expect(
      loggedMealImages({
        images: ['/uploads/food_entry_meals/e/1.jpg'],
        meal_images: ['/uploads/meals/m/1.jpg'],
      }),
    ).toEqual(['/uploads/food_entry_meals/e/1.jpg']);
  });

  it('falls back to the meal template', () => {
    expect(
      loggedMealImage({ images: [], meal_images: ['/uploads/meals/m/1.jpg'] }),
    ).toBe('/uploads/meals/m/1.jpg');
  });
});
