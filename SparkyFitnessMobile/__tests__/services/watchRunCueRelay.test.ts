import {
  resetWatchCueRelay,
  speakWatchCue,
} from '../../src/services/watchRunCueRelay';
import {
  beginRecordingCues,
  endRecordingCues,
  speakRecordingCue,
} from '../../src/services/recordingCues';

jest.mock('../../src/services/recordingCues', () => ({
  beginRecordingCues: jest.fn(),
  endRecordingCues: jest.fn(),
  speakRecordingCue: jest.fn(),
}));

const speak = jest.mocked(speakRecordingCue);
const finish = (call: number) => speak.mock.calls[call][1]?.();

beforeEach(() => {
  jest.clearAllMocks();
  resetWatchCueRelay();
});

test('says a cue now and lets the audio go when it is done', () => {
  speakWatchCue('Paused.', false);
  expect(beginRecordingCues).toHaveBeenCalledTimes(1);
  expect(speak).toHaveBeenCalledWith(
    'Paused.',
    expect.any(Function),
    undefined
  );
  finish(0);
  expect(endRecordingCues).toHaveBeenCalledTimes(1);
});

test('queues a cue behind the one being said', () => {
  speakWatchCue('Kilometer 1.', false);
  speakWatchCue('Kilometer 2.', false);
  expect(speak).toHaveBeenCalledTimes(1);
  finish(0);
  expect(speak).toHaveBeenLastCalledWith(
    'Kilometer 2.',
    expect.any(Function),
    undefined
  );
  expect(endRecordingCues).not.toHaveBeenCalled();
});

test('an interrupting cue goes first and drops what was waiting', () => {
  speakWatchCue('Kilometer 1.', false);
  speakWatchCue('Kilometer 2.', false);
  speakWatchCue('Walk, 1 minute.', true);
  expect(speak).toHaveBeenLastCalledWith(
    'Walk, 1 minute.',
    expect.any(Function),
    undefined
  );
  finish(1);
  expect(speak).toHaveBeenCalledTimes(2);
  expect(endRecordingCues).toHaveBeenCalledTimes(1);
});

test('ignores an empty cue', () => {
  speakWatchCue('', true);
  expect(speak).not.toHaveBeenCalled();
});

test('the stopped cue an interrupt cuts off does not end the cue session', () => {
  speakWatchCue('Kilometer 1.', false);
  speakWatchCue('Paused.', true);
  // Stopping the first cue fires its callback while the interrupting cue is
  // already being said.
  finish(0);
  expect(endRecordingCues).not.toHaveBeenCalled();
  expect(speak).toHaveBeenCalledTimes(2);
  finish(1);
  expect(endRecordingCues).toHaveBeenCalledTimes(1);
});

test('speaks a cue in the language the watch wrote it in, and the app language when none is given', () => {
  speakWatchCue('Pausiert.', true, 'de-DE');
  expect(speak).toHaveBeenLastCalledWith(
    'Pausiert.',
    expect.any(Function),
    'de-DE'
  );
  speakWatchCue('Paused.', true, '');
  expect(speak).toHaveBeenLastCalledWith(
    'Paused.',
    expect.any(Function),
    undefined
  );
});

test('a queued cue keeps its own language', () => {
  speakWatchCue('Kilometer 1.', false, 'en-US');
  speakWatchCue('Kilometer 2.', false, 'en-US');
  finish(0);
  expect(speak).toHaveBeenLastCalledWith(
    'Kilometer 2.',
    expect.any(Function),
    'en-US'
  );
});
