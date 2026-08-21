import {
  resolveExerciseImageSrc,
  filterValidExerciseImages,
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

  it('returns an empty array for missing or non-array input', () => {
    expect(filterValidExerciseImages(undefined)).toEqual([]);
    expect(filterValidExerciseImages(null)).toEqual([]);
    expect(filterValidExerciseImages([])).toEqual([]);
    expect(filterValidExerciseImages(['[]'])).toEqual([]);
  });
});
