import {
  watchHiddenPagesForContext,
  watchOffFeatures,
} from '../../src/utils/watchPageFeatures';
import { WATCH_PAGE_KEYS } from '../../src/constants/watchPages';

describe('watchOffFeatures', () => {
  it('is not known until the choices have been read', () => {
    expect(watchOffFeatures(undefined)).toBeUndefined();
  });

  it('lists the watch features turned off in the app', () => {
    expect(
      watchOffFeatures({ feature_choices: { mobile: { medications: false } } })
    ).toEqual(['medications']);
  });

  it('follows the app, not the website', () => {
    expect(
      watchOffFeatures({ feature_choices: { web: { medications: false } } })
    ).toEqual([]);
  });

  it('leaves out features the watch has nothing of', () => {
    expect(
      watchOffFeatures({ feature_choices: { mobile: { labResults: false } } })
    ).toEqual([]);
  });

  it('uses the defaults on a server older than Features', () => {
    expect(watchOffFeatures(null)).toEqual([]);
  });
});

describe('watchHiddenPagesForContext', () => {
  it('keeps the stored hidden pages when nothing is off', () => {
    expect(watchHiddenPagesForContext(['trend', 'steps'], [])).toEqual([
      'trend',
      'steps',
    ]);
  });

  it('adds the pages of features that are off', () => {
    expect(watchHiddenPagesForContext(['trend'], ['medications'])).toEqual([
      'trend',
      'medications',
    ]);
  });

  it('does not list a page twice', () => {
    expect(
      watchHiddenPagesForContext(['medications', 'trend'], ['medications'])
    ).toEqual(['medications', 'trend']);
  });

  it('shows Goals when the off features would leave no page', () => {
    const allButMedications = WATCH_PAGE_KEYS.filter(
      (page) => page !== 'medications'
    );
    const hidden = watchHiddenPagesForContext(allButMedications, [
      'medications',
    ]);
    expect(hidden).not.toContain('goals');
    expect(hidden).toContain('medications');
    expect(hidden).toHaveLength(WATCH_PAGE_KEYS.length - 1);
  });
});
