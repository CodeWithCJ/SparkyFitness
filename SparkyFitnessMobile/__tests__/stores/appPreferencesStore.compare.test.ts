import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useAppPreferencesStore,
  PREFERENCE_DEFAULTS,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import type { CompareQuestion } from '@workspace/shared';

describe('appPreferencesStore compare recents', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetAppPreferencesStoreForTests();
  });

  const q = (b: CompareQuestion['b']): CompareQuestion => ({
    a: 'timeAsleep',
    b,
    choice: 'sameDay',
  });

  it('starts empty', () => {
    expect(useAppPreferencesStore.getState().compareRecentQuestions).toEqual(
      []
    );
  });

  it('keeps five, newest first, without duplicates', () => {
    const { addCompareRecentQuestion } = useAppPreferencesStore.getState();
    (
      ['energy', 'mood', 'focus', 'steps', 'caffeine', 'meditated'] as const
    ).forEach((b) => addCompareRecentQuestion(q(b)));
    addCompareRecentQuestion(q('focus'));
    expect(
      useAppPreferencesStore.getState().compareRecentQuestions.map((r) => r.b)
    ).toEqual(['focus', 'meditated', 'caffeine', 'steps', 'mood']);
  });

  it('loads as empty from a blob written before the field existed', async () => {
    const old = { ...PREFERENCE_DEFAULTS } as Record<string, unknown>;
    delete old.compareRecentQuestions;
    await AsyncStorage.setItem(
      '@SparkyFitness/app-preferences',
      JSON.stringify({ state: old, version: 1 })
    );
    await useAppPreferencesStore.persist.rehydrate();
    expect(useAppPreferencesStore.getState().compareRecentQuestions).toEqual(
      []
    );
  });

  it('persists the recents', async () => {
    useAppPreferencesStore.getState().addCompareRecentQuestion(q('energy'));
    const raw = await AsyncStorage.getItem('@SparkyFitness/app-preferences');
    expect(JSON.parse(raw ?? '{}').state.compareRecentQuestions).toEqual([
      q('energy'),
    ]);
  });
});
