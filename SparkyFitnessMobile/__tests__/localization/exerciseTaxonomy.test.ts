import { localizeExerciseTaxonomyValue } from '../../src/localization/exerciseTaxonomy';
import i18n, { initializeI18n } from '../../src/localization/i18n';

describe('localizeExerciseTaxonomyValue', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it.each([
    ['category', 'strength', 'Strength'],
    ['modality', 'weight_reps', 'Weight & Reps'],
    ['level', 'beginner', 'Beginner'],
    ['force', 'push', 'Push'],
    ['mechanic', 'compound', 'Compound'],
  ] as const)('localizes known %s values in English', (kind, value, expected) => {
    expect(localizeExerciseTaxonomyValue(i18n.t.bind(i18n), kind, value)).toBe(expected);
  });

  it('localizes known values in Polish and reacts to runtime language changes', async () => {
    const t = i18n.t.bind(i18n);
    expect(localizeExerciseTaxonomyValue(t, 'category', 'strength')).toBe('Strength');
    await i18n.changeLanguage('pl');
    expect(localizeExerciseTaxonomyValue(t, 'category', 'strength')).toBe('Siłowe');
    expect(localizeExerciseTaxonomyValue(t, 'modality', 'weight_reps')).toBe('Obciążenie i powtórzenia');
    expect(localizeExerciseTaxonomyValue(t, 'level', 'beginner')).toBe('Początkujący');
    expect(localizeExerciseTaxonomyValue(t, 'force', 'push')).toBe('Wypychanie');
    expect(localizeExerciseTaxonomyValue(t, 'mechanic', 'compound')).toBe('Złożone');
    await i18n.changeLanguage('en');
    expect(localizeExerciseTaxonomyValue(t, 'category', 'strength')).toBe('Strength');
  });

  it('normalizes known values but preserves unknown values literally', () => {
    const t = i18n.t.bind(i18n);
    expect(localizeExerciseTaxonomyValue(t, 'category', ' Strength ')).toBe('Strength');
    expect(localizeExerciseTaxonomyValue(t, 'level', 'BEGINNER')).toBe('Beginner');
    expect(localizeExerciseTaxonomyValue(t, 'category', 'My Custom Category')).toBe('My Custom Category');
    expect(localizeExerciseTaxonomyValue(t, 'mechanic', 'My Mechanic')).toBe('My Mechanic');
    expect(localizeExerciseTaxonomyValue(t, 'category', null)).toBe('');
    expect(localizeExerciseTaxonomyValue(t, 'category', undefined)).toBe('');
    expect(localizeExerciseTaxonomyValue(t, 'category', '')).toBe('');
  });
});
