import * as Speech from 'expo-speech';
import {
  speakRecordingCue,
  stopRecordingCues,
} from '../../src/services/recordingCues';
import {
  __resetSpeechVoicesForTests,
  loadSpeechVoices,
} from '../../src/services/speechVoice';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));
jest.mock('../../src/services/sounds', () => ({
  beginCueDucking: jest.fn(() => false),
  endCueDucking: jest.fn(),
  startRecordingCueSession: jest.fn(async () => undefined),
  stopRecordingCueSession: jest.fn(async () => undefined),
}));

const mockSpeak = Speech.speak as jest.MockedFunction<typeof Speech.speak>;

describe('recording cues', () => {
  beforeEach(() => {
    __resetSpeechVoicesForTests();
    mockSpeak.mockClear();
  });

  it('holds the first cue until the voices are read', async () => {
    speakRecordingCue('Kilometer 1');
    expect(mockSpeak).not.toHaveBeenCalled();
    await loadSpeechVoices();
    await Promise.resolve();
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });

  it('drops a cue still waiting for the voices when the session ends', async () => {
    speakRecordingCue('Kilometer 1');
    stopRecordingCues();
    await loadSpeechVoices();
    await Promise.resolve();
    expect(mockSpeak).not.toHaveBeenCalled();
  });
});
