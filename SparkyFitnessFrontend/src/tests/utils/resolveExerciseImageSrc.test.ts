import {
  resolveExerciseImageSrc,
  filterValidExerciseImages,
  firstExerciseImage,
} from '@/utils/exercises';

describe('resolveExerciseImageSrc', () => {
  it('prefixes relative upload paths with /uploads/exercises/', () => {
    // Saved wger / free-exercise-db exercises persist a relative path whose
    // files are served from the uploads directory.
    expect(
      resolveExerciseImageSrc('Biceps_Curls_With_SZ_bar/abc_123.png')
    ).toBe('/uploads/exercises/Biceps_Curls_With_SZ_bar/abc_123.png');
    expect(resolveExerciseImageSrc('Machine_Bicep_Curl/0.jpg')).toBe(
      '/uploads/exercises/Machine_Bicep_Curl/0.jpg'
    );
  });

  it('uses absolute http(s) URLs as-is', () => {
    const httpsUrl =
      'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bench/0.jpg';
    expect(resolveExerciseImageSrc(httpsUrl)).toBe(httpsUrl);
    expect(resolveExerciseImageSrc('http://example.com/a.png')).toBe(
      'http://example.com/a.png'
    );
  });

  it('uses absolute app paths (already rooted at /) as-is', () => {
    // CSV imports persist the full app path; prefixing again would produce
    // /uploads/exercises//uploads/exercises/... and 404.
    expect(
      resolveExerciseImageSrc('/uploads/exercises/Bench_Press/0_abc123.jpg')
    ).toBe('/uploads/exercises/Bench_Press/0_abc123.jpg');
    expect(resolveExerciseImageSrc('/static/img/a.png')).toBe(
      '/static/img/a.png'
    );
  });

  it('is case-insensitive about the URL scheme', () => {
    expect(resolveExerciseImageSrc('HTTPS://example.com/a.png')).toBe(
      'HTTPS://example.com/a.png'
    );
  });

  it('returns an empty string for missing values', () => {
    expect(resolveExerciseImageSrc(undefined)).toBe('');
    expect(resolveExerciseImageSrc('')).toBe('');
  });
});

describe('filterValidExerciseImages', () => {
  it('drops empty, whitespace, and "[]" sentinel entries', () => {
    expect(
      filterValidExerciseImages(['', '  ', '[]', 'Machine_Bicep_Curl/0.jpg'])
    ).toEqual(['Machine_Bicep_Curl/0.jpg']);
  });

  it('keeps the order of valid entries in a mixed array', () => {
    expect(
      filterValidExerciseImages([
        '[]',
        'A/0.jpg',
        '',
        'https://example.com/b.png',
      ])
    ).toEqual(['A/0.jpg', 'https://example.com/b.png']);
  });

  it('drops the stray "[" or quote earlier preset saves stored as an image', () => {
    expect(filterValidExerciseImages('[')).toEqual([]);
    expect(filterValidExerciseImages('"')).toEqual([]);
    expect(filterValidExerciseImages(['[', '"', 'Squat/0.jpg'])).toEqual([
      'Squat/0.jpg',
    ]);
  });

  it('decodes stored JSON text, including double-encoded text', () => {
    expect(filterValidExerciseImages('["Squat/0.jpg","Squat/1.jpg"]')).toEqual([
      'Squat/0.jpg',
      'Squat/1.jpg',
    ]);
    expect(filterValidExerciseImages('"[\\"Squat/0.jpg\\"]"')).toEqual([
      'Squat/0.jpg',
    ]);
  });

  it('returns an empty array for missing or non-array input', () => {
    expect(filterValidExerciseImages(undefined)).toEqual([]);
    expect(filterValidExerciseImages(null)).toEqual([]);
    expect(filterValidExerciseImages([])).toEqual([]);
    expect(filterValidExerciseImages(['[]'])).toEqual([]);
  });
});

describe('firstExerciseImage', () => {
  it('returns the first usable image of an array or its stored JSON text', () => {
    expect(firstExerciseImage(['Squat/0.jpg', 'Squat/1.jpg'])).toBe(
      'Squat/0.jpg'
    );
    expect(firstExerciseImage('["Squat/0.jpg","Squat/1.jpg"]')).toBe(
      'Squat/0.jpg'
    );
  });

  it('keeps a single stored path or URL', () => {
    expect(firstExerciseImage('Barbell_Squat/0.jpg')).toBe(
      'Barbell_Squat/0.jpg'
    );
    expect(firstExerciseImage('https://example.com/squat.jpg')).toBe(
      'https://example.com/squat.jpg'
    );
  });

  it('returns undefined for no image or a stray character', () => {
    expect(firstExerciseImage(undefined)).toBeUndefined();
    expect(firstExerciseImage('')).toBeUndefined();
    expect(firstExerciseImage('[]')).toBeUndefined();
    expect(firstExerciseImage('[')).toBeUndefined();
    expect(firstExerciseImage('"')).toBeUndefined();
  });
});
