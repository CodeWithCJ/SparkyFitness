import {
  detectDecimalFormat,
  resolveDecimalFormat,
  suggestHeaderMapping,
  type DecimalDetection,
} from '@workspace/shared';

// DecimalFormat has existed in csvValue.ts since the #1960 fix, but no
// caller ever passed 'eu' — this detection function is what finally makes
// the choice visible/auto-detected instead of permanently defaulting to
// 'us'. These tests pin the "only vote on genuinely unambiguous evidence"
// contract described in csvFormat.ts.
describe('detectDecimalFormat', () => {
  it('detects EU when the majority of unambiguous cells use comma-as-decimal', () => {
    const rows = [{ weight: '80,2' }, { weight: '79,7' }, { weight: '81,4' }];
    const result = detectDecimalFormat(rows, ['weight']);
    expect(result).toEqual({ format: 'eu', confident: true, evidence: '80,2' });
  });

  it('detects US when the majority of unambiguous cells use dot-as-decimal', () => {
    const rows = [{ weight: '80.2' }, { weight: '79.7' }];
    const result = detectDecimalFormat(rows, ['weight']);
    expect(result).toEqual({ format: 'us', confident: true, evidence: '80.2' });
  });

  it('defaults to us, not-confident, when there is no evidence at all', () => {
    const rows = [{ weight: '80' }, { weight: '' }];
    expect(detectDecimalFormat(rows, ['weight'])).toEqual({
      format: 'us',
      confident: false,
    });
  });

  it('does not let the ambiguous "1,234"-shaped cell vote either way', () => {
    // A lone comma with an exact 3-digit tail is the one case toNumber
    // itself can't resolve — it must not be treated as evidence here either,
    // or detection would just be guessing under a different name.
    const rows = [{ weight: '1,234' }, { weight: '2,345' }];
    expect(detectDecimalFormat(rows, ['weight'])).toEqual({
      format: 'us',
      confident: false,
    });
  });

  it('does not let a both-separators cell vote (it is locale-agnostic already)', () => {
    const rows = [{ weight: '1.234,56' }, { weight: '1,234.56' }];
    expect(detectDecimalFormat(rows, ['weight'])).toEqual({
      format: 'us',
      confident: false,
    });
  });

  it('counts negative decimals as evidence (the leading - is not a separator)', () => {
    const rows = [{ weight: '-80,2' }, { weight: '-79,7' }];
    const result = detectDecimalFormat(rows, ['weight']);
    expect(result).toEqual({
      format: 'eu',
      confident: true,
      evidence: '-80,2',
    });
  });

  it('votes US on a 4+ digit dot fraction (1.2345), not just 1-2 digits', () => {
    const rows = [{ weight: '1.2345' }, { weight: '2.9876' }];
    const result = detectDecimalFormat(rows, ['weight']);
    expect(result.format).toBe('us');
    expect(result.confident).toBe(true);
  });

  it('only scans the declared numeric columns, not arbitrary text cells', () => {
    const rows = [{ name: 'a,b', weight: '80.5' }];
    const result = detectDecimalFormat(rows, ['weight']);
    expect(result.format).toBe('us');
    expect(result.confident).toBe(true);
  });

  it('respects an explicit sample size cap when the caller passes one', () => {
    const rows = Array.from({ length: 300 }, (_, i) =>
      i < 250 ? { weight: '1,5' } : { weight: '1.5' }
    );
    // Only the first 200 rows (all EU-shaped) should be sampled.
    const result = detectDecimalFormat(rows, ['weight'], 200);
    expect(result.format).toBe('eu');
  });

  it('finds a single clarifying row anywhere in a large file by default (no cap)', () => {
    // 998 rows are the ambiguous "1,234"-shaped case (no vote either way);
    // exactly one row near the end unambiguously indicates EU. A capped
    // scan (the old default was 200 rows) would never reach row 999 and
    // would silently resolve as US, misparsing every ambiguous row.
    const rows = Array.from({ length: 1000 }, (_, i) => {
      if (i === 998) return { weight: '10,333' }; // 3-digit tail: ambiguous, no vote
      if (i === 999) return { weight: '80,2' }; // unambiguous EU evidence
      return { weight: '10,333' };
    });
    const result = detectDecimalFormat(rows, ['weight']);
    expect(result).toEqual({ format: 'eu', confident: true, evidence: '80,2' });
  });
});

describe('resolveDecimalFormat', () => {
  const detection: DecimalDetection = {
    format: 'eu',
    confident: true,
    evidence: '80,2',
  };

  it('resolves "auto" to the detection result', () => {
    expect(resolveDecimalFormat('auto', detection)).toBe('eu');
  });

  it('an explicit choice always wins over detection', () => {
    expect(resolveDecimalFormat('us', detection)).toBe('us');
    expect(resolveDecimalFormat('eu', { format: 'us', confident: true })).toBe(
      'eu'
    );
  });
});

// MFP Premium export headers, anonymized (no personal data — just the column
// names and a couple of plausible values). These are the real-world case the
// normalization + alias table exists to absorb: MFP ships "Protein (g)",
// "Carbohydrates (g)", "Sodium (mg)", "Fiber", "Sugar", "Meal", "Date",
// "Exercise" — none of which match the template headers by exact name.
describe('suggestHeaderMapping', () => {
  it('matches an MFP nutrition export to the food-diary headers', () => {
    const required = [
      'date',
      'meal_type',
      'calories',
      'protein',
      'carbs',
      'fat',
      'saturated_fat',
      'sodium',
      'dietary_fiber',
      'sugars',
      'vitamin_a',
      'iron',
    ];
    const fileHeaders = [
      'Date',
      'Meal',
      'Calories',
      'Fat (g)',
      'Saturated Fat',
      'Sodium (mg)',
      'Carbohydrates (g)',
      'Fiber',
      'Sugar',
      'Protein (g)',
      'Vitamin A',
      'Iron',
    ];
    const mapping = suggestHeaderMapping(required, fileHeaders);
    expect(mapping).toEqual({
      date: 'Date',
      meal_type: 'Meal',
      calories: 'Calories',
      protein: 'Protein (g)',
      carbs: 'Carbohydrates (g)',
      fat: 'Fat (g)',
      saturated_fat: 'Saturated Fat',
      sodium: 'Sodium (mg)',
      dietary_fiber: 'Fiber',
      sugars: 'Sugar',
      vitamin_a: 'Vitamin A',
      iron: 'Iron',
    });
  });

  it('matches an MFP measurement export (date + weight, rest absent)', () => {
    const required = ['date', 'weight', 'body_fat', 'height', 'waist', 'hips'];
    const fileHeaders = ['Date', 'Weight'];
    const mapping = suggestHeaderMapping(required, fileHeaders);
    expect(mapping['date']).toBe('Date');
    expect(mapping['weight']).toBe('Weight');
    // MFP carries no body-comp columns — those stay unmapped, not guessed.
    expect(mapping['body_fat']).toBeUndefined();
    expect(mapping['height']).toBeUndefined();
    expect(mapping['waist']).toBeUndefined();
    expect(mapping['hips']).toBeUndefined();
  });

  it('matches an MFP exercise export (date + exercise name)', () => {
    const required = [
      'entry_date',
      'exercise_name',
      'exercise_force',
      'exercise_level',
      'exercise_mechanic',
    ];
    const fileHeaders = [
      'Date',
      'Exercise',
      'Type',
      'Exercise Calories',
      'Exercise Minutes',
      'Sets',
      'Reps Per Set',
      'Pounds',
      'Steps',
      'Note',
    ];
    const mapping = suggestHeaderMapping(required, fileHeaders);
    expect(mapping['entry_date']).toBe('Date');
    expect(mapping['exercise_name']).toBe('Exercise');
    // "Type" is not a recognized alias for force/level/mechanic — left unmapped.
    expect(mapping['exercise_force']).toBeUndefined();
    expect(mapping['exercise_level']).toBeUndefined();
    expect(mapping['exercise_mechanic']).toBeUndefined();
  });

  it('strips parenthetical units and punctuation so "Protein (g)" == "protein"', () => {
    expect(suggestHeaderMapping(['protein'], ['Protein (g)'])['protein']).toBe(
      'Protein (g)'
    );
    expect(suggestHeaderMapping(['sodium'], ['Sodium (mg)'])['sodium']).toBe(
      'Sodium (mg)'
    );
  });

  it('still matches exact/case-insensitive headers (regression: no alias needed)', () => {
    expect(suggestHeaderMapping(['calories'], ['Calories'])['calories']).toBe(
      'Calories'
    );
    expect(
      suggestHeaderMapping(['saturated_fat'], ['Saturated Fat'])[
        'saturated_fat'
      ]
    ).toBe('Saturated Fat');
  });

  it('leaves an unrecognized header unmapped rather than binding it wrong', () => {
    const mapping = suggestHeaderMapping(
      ['protein'],
      ['Fruit (g)', 'Vegetables']
    );
    expect(mapping['protein']).toBeUndefined();
  });

  it('prefers the clean column when a clean and a parenthetical header both match', () => {
    // "Fat" (canonical) and "Fat (g)" both normalize to "fat" — bind the clean one,
    // not whichever happens to be first.
    const mapping = suggestHeaderMapping(['fat'], ['Fat (g)', 'Fat']);
    expect(mapping['fat']).toBe('Fat');
  });

  it('leaves a header unmapped when its canonical and alias columns both appear', () => {
    // "Entry Date" normalizes to entry_date (canonical) and "Date" is its alias —
    // both match entry_date, so the guess is ambiguous and left for the user.
    const mapping = suggestHeaderMapping(
      ['entry_date'],
      ['Date', 'Entry Date']
    );
    expect(mapping['entry_date']).toBeUndefined();
  });

  it('binds the gram column when a gram and an energy column both match', () => {
    // "Fat (kcal)" is an energy value, not a mass value — it's rejected for the
    // gram-based fat field, leaving "Fat (g)" as the sole valid match.
    const mapping = suggestHeaderMapping(['fat'], ['Fat (g)', 'Fat (kcal)']);
    expect(mapping['fat']).toBe('Fat (g)');
  });

  it('leaves a mass field unmapped when its only candidate is energy-labelled', () => {
    // Regression: a file whose only fat-like column is "Fat (kcal)" must NOT be
    // bound to the gram-based fat field — the unit is stripped during matching,
    // so without the guard the energy value would be stored as grams.
    const mapping = suggestHeaderMapping(['fat'], ['Fat (kcal)']);
    expect(mapping['fat']).toBeUndefined();
  });

  it('keeps an energy field bound to an energy-labelled column', () => {
    // "Calories" is itself an energy field, so "Calories (kcal)" is a valid
    // match (not rejected) for it.
    const mapping = suggestHeaderMapping(['calories'], ['Calories (kcal)']);
    expect(mapping['calories']).toBe('Calories (kcal)');
  });

  it('leaves a mass field unmapped when its only candidate is joule-labelled', () => {
    // "Fat (kilojoules)" is an energy value, not a mass value — it's rejected
    // for the gram-based fat field, just like "Fat (kcal)".
    const mapping = suggestHeaderMapping(['fat'], ['Fat (kilojoules)']);
    expect(mapping['fat']).toBeUndefined();
  });

  it('rejects a kJ-labelled column for an energy field stored in kcal', () => {
    // The energy fields store kcal, so "Calories (kJ)" (kilojoules) must not
    // bind to them — the value would be stored as kcal without conversion.
    const mapping = suggestHeaderMapping(['calories'], ['Calories (kJ)']);
    expect(mapping['calories']).toBeUndefined();
  });

  it('keeps a kJ column for an energy field when a kcal column is also present', () => {
    // With both "Calories (kJ)" and "Calories (kcal)", the kcal column is the
    // valid match for the kcal-stored energy field.
    const mapping = suggestHeaderMapping(
      ['calories'],
      ['Calories (kJ)', 'Calories (kcal)']
    );
    expect(mapping['calories']).toBe('Calories (kcal)');
  });
});
