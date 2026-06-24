import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, act } from '@testing-library/react-native';
import { createBooleanPreference } from '../../src/services/booleanPreference';

const KEY = '@HealthConnect:testPreference';

describe('createBooleanPreference', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('uses the default value when nothing is persisted', async () => {
    const pref = createBooleanPreference(KEY, true);
    await pref.initialize();
    expect(pref.get()).toBe(true);

    const offByDefault = createBooleanPreference(KEY, false);
    await offByDefault.initialize();
    expect(offByDefault.get()).toBe(false);
  });

  it('restores the persisted value on init', async () => {
    await AsyncStorage.setItem(KEY, 'false');
    const pref = createBooleanPreference(KEY, true);
    await pref.initialize();
    expect(pref.get()).toBe(false);
  });

  it('persists the value when set', async () => {
    const pref = createBooleanPreference(KEY, true);
    await pref.set(false);
    expect(pref.get()).toBe(false);
    expect(await AsyncStorage.getItem(KEY)).toBe('false');

    await pref.set(true);
    expect(pref.get()).toBe(true);
    expect(await AsyncStorage.getItem(KEY)).toBe('true');
  });

  it('does not let initialize overwrite a user toggle made first', async () => {
    await AsyncStorage.setItem(KEY, 'true');
    const pref = createBooleanPreference(KEY, true);
    await pref.set(false);
    await pref.initialize();
    expect(pref.get()).toBe(false);
  });

  it('does not let initialize overwrite a user toggle that lands mid-flight', async () => {
    await AsyncStorage.setItem(KEY, 'true');
    const pref = createBooleanPreference(KEY, true);
    const initPromise = pref.initialize();
    await pref.set(false);
    await initPromise;
    expect(pref.get()).toBe(false);
  });

  it('notifies already-mounted hook subscribers when initialize loads from storage', async () => {
    await AsyncStorage.setItem(KEY, 'false');
    const pref = createBooleanPreference(KEY, true);

    const { result } = renderHook(() => pref.use());
    expect(result.current).toBe(true); // default before init resolves

    await act(async () => {
      await pref.initialize();
    });
    expect(result.current).toBe(false);
  });

  it('isolates state between independent preferences', async () => {
    const a = createBooleanPreference('@HealthConnect:a', true);
    const b = createBooleanPreference('@HealthConnect:b', true);
    await a.set(false);
    expect(a.get()).toBe(false);
    expect(b.get()).toBe(true);
  });
});
