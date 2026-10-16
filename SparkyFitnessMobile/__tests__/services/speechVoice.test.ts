import * as Speech from 'expo-speech';
import {
  __resetSpeechVoicesForTests,
  loadSpeechVoices,
  resolveSpeechVoice,
} from '../../src/services/speechVoice';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockVoices = Speech.getAvailableVoicesAsync as jest.MockedFunction<
  typeof Speech.getAvailableVoicesAsync
>;

const voices = [
  {
    identifier: 'com.apple.voice.compact.en-US.Samantha',
    name: 'Samantha',
    language: 'en-US',
    quality: 'Default',
  },
  {
    identifier: 'com.apple.voice.premium.en-US.Ava',
    name: 'Ava (Premium)',
    language: 'en-US',
    quality: 'Default',
  },
] as Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>;

describe('resolveSpeechVoice', () => {
  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
    __resetSpeechVoicesForTests();
    mockVoices.mockReset();
  });

  it('names no voice until the installed ones have been read', () => {
    useAppPreferencesStore.getState().setGuidedVoiceId('anything');
    expect(resolveSpeechVoice('en-US')).toBeUndefined();
  });

  it('uses the best installed voice when none is picked', async () => {
    mockVoices.mockResolvedValue(voices);
    await loadSpeechVoices();
    expect(resolveSpeechVoice('en-US')).toBe(
      'com.apple.voice.premium.en-US.Ava'
    );
  });

  it('uses the picked voice while it is installed', async () => {
    mockVoices.mockResolvedValue(voices);
    await loadSpeechVoices();
    useAppPreferencesStore
      .getState()
      .setGuidedVoiceId('com.apple.voice.compact.en-US.Samantha');
    expect(resolveSpeechVoice('en-US')).toBe(
      'com.apple.voice.compact.en-US.Samantha'
    );
  });

  it('falls back to the best voice when the picked one is gone', async () => {
    mockVoices.mockResolvedValue(voices);
    await loadSpeechVoices();
    useAppPreferencesStore
      .getState()
      .setGuidedVoiceId('com.apple.voice.removed');
    expect(resolveSpeechVoice('en-US')).toBe(
      'com.apple.voice.premium.en-US.Ava'
    );
  });

  it('keeps going with the system voice when the voices cannot be read, and tries again later', async () => {
    mockVoices.mockRejectedValueOnce(new Error('no tts'));
    await expect(loadSpeechVoices()).resolves.toEqual([]);
    expect(resolveSpeechVoice('en-US')).toBeUndefined();

    mockVoices.mockResolvedValue(voices);
    await loadSpeechVoices();
    expect(resolveSpeechVoice('en-US')).toBe(
      'com.apple.voice.premium.en-US.Ava'
    );
  });

  it('ignores a picked voice that is in another language than the app', async () => {
    mockVoices.mockResolvedValue([
      ...voices,
      {
        identifier: 'com.apple.voice.premium.es-ES.Monica',
        name: 'Monica (Premium)',
        language: 'es-ES',
        quality: 'Default',
      },
    ] as Awaited<ReturnType<typeof Speech.getAvailableVoicesAsync>>);
    await loadSpeechVoices();
    useAppPreferencesStore
      .getState()
      .setGuidedVoiceId('com.apple.voice.premium.es-ES.Monica');
    expect(resolveSpeechVoice('en-US')).toBe(
      'com.apple.voice.premium.en-US.Ava'
    );
    expect(resolveSpeechVoice('es-ES')).toBe(
      'com.apple.voice.premium.es-ES.Monica'
    );
  });
});
