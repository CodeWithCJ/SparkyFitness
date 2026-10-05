import {
  BrowserVoiceInput,
  type BrowserSpeechRecognition,
} from '@/utils/browserVoiceInput';
import { MAX_VOICE_UPLOAD_BYTES } from '@workspace/shared';

class Recognition implements BrowserSpeechRecognition {
  static current: Recognition;
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: BrowserSpeechRecognition['onresult'] = null;
  onerror: BrowserSpeechRecognition['onerror'] = null;
  onend: BrowserSpeechRecognition['onend'] = null;
  onspeechstart: BrowserSpeechRecognition['onspeechstart'] = null;
  onspeechend: BrowserSpeechRecognition['onspeechend'] = null;
  start = jest.fn();
  stop = jest.fn();
  abort = jest.fn();
  constructor() {
    Recognition.current = this;
  }
}

class Recorder {
  static current: Recorder;
  static isTypeSupported = jest.fn(() => true);
  state = 'inactive';
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  constructor(
    _stream: MediaStream,
    public options: MediaRecorderOptions
  ) {
    Recorder.current = this;
  }
  start = jest.fn(() => {
    this.state = 'recording';
  });
  stop = jest.fn(() => {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio']) });
    this.onstop?.();
  });
}

const stopTrack = jest.fn();
const track = { stop: stopTrack, onended: null as (() => void) | null };
const stream = { getTracks: () => [track] } as unknown as MediaStream;
const getUserMedia = jest.fn<Promise<MediaStream>, [MediaStreamConstraints]>();
const callbacks = {
  onPhase: jest.fn(),
  onTranscript: jest.fn(),
  onLevel: jest.fn(),
  onError: jest.fn(),
  transcribe: jest.fn<Promise<{ text: string }>, [Blob, string, AbortSignal]>(),
};
let engine: BrowserVoiceInput;
const originals = {
  recognition: Object.getOwnPropertyDescriptor(window, 'SpeechRecognition'),
  recorder: Object.getOwnPropertyDescriptor(window, 'MediaRecorder'),
  mediaDevices: Object.getOwnPropertyDescriptor(navigator, 'mediaDevices'),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  Object.defineProperty(window, 'SpeechRecognition', {
    configurable: true,
    value: Recognition,
  });
  Object.defineProperty(window, 'MediaRecorder', {
    configurable: true,
    value: Recorder,
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  getUserMedia.mockResolvedValue(stream);
  callbacks.transcribe.mockResolvedValue({ text: 'Log an apple' });
  Recorder.isTypeSupported.mockReturnValue(true);
  engine = new BrowserVoiceInput(callbacks);
});
afterEach(() => {
  engine.cancel();
  jest.useRealTimers();
  for (const [target, key, descriptor] of [
    [window, 'SpeechRecognition', originals.recognition],
    [window, 'MediaRecorder', originals.recorder],
    [navigator, 'mediaDevices', originals.mediaDevices],
  ] as const) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
});

it('uses system recognition by default and waits for the final result after Stop', async () => {
  await engine.start(null, 'uk-UA');
  const recognition = Recognition.current;
  expect(recognition.lang).toBe('uk-UA');
  recognition.onresult?.({ results: [[{ transcript: 'Log an' }]] });
  expect(callbacks.onTranscript).not.toHaveBeenCalled();
  engine.stop();
  expect(recognition.stop).toHaveBeenCalled();
  expect(callbacks.onPhase).toHaveBeenLastCalledWith('processing');
  recognition.onresult?.({ results: [[{ transcript: 'Log an apple' }]] });
  recognition.onend?.();
  expect(callbacks.onTranscript).toHaveBeenCalledWith('Log an apple');
  expect(callbacks.onPhase).toHaveBeenLastCalledWith('idle');
  expect(callbacks.transcribe).not.toHaveBeenCalled();
  expect(getUserMedia).not.toHaveBeenCalled();
});

it('never falls back to AI when the browser lacks system recognition', async () => {
  Reflect.deleteProperty(window, 'SpeechRecognition');
  await engine.start(null, 'en');
  expect(callbacks.onError).toHaveBeenCalledWith('unsupported');
  expect(callbacks.transcribe).not.toHaveBeenCalled();
  expect(getUserMedia).not.toHaveBeenCalled();
});

it('invalidates recognition callbacks on cancel', async () => {
  await engine.start(null, 'en');
  const { onresult, onend } = Recognition.current;
  engine.cancel();
  onresult?.({ results: [[{ transcript: 'Late result' }]] });
  onend?.();
  expect(Recognition.current.abort).toHaveBeenCalled();
  expect(callbacks.onTranscript).not.toHaveBeenCalled();
});

it('reports denied permission without keeping recognition active', async () => {
  await engine.start(null, 'en');
  Recognition.current.onerror?.({ error: 'not-allowed' });
  expect(callbacks.onError).toHaveBeenCalledWith('permission');
  expect(callbacks.onPhase).toHaveBeenLastCalledWith('idle');
});

it('times out when the system recognizer never finishes after Stop', async () => {
  await engine.start(null, 'en');
  engine.stop();
  jest.advanceTimersByTime(10_000);
  expect(callbacks.onError).toHaveBeenCalledWith('failed');
  expect(callbacks.onPhase).toHaveBeenLastCalledWith('idle');
});

it('records only for an explicitly selected service and releases the microphone before uploading', async () => {
  await engine.start('voice-service', 'en');
  expect(Recorder.current.start).toHaveBeenCalledWith(250);
  expect(callbacks.transcribe).not.toHaveBeenCalled();
  engine.stop();
  expect(stopTrack).toHaveBeenCalled();
  expect(callbacks.transcribe).toHaveBeenCalledWith(
    expect.any(Blob),
    'voice-service',
    expect.any(AbortSignal)
  );
  await Promise.resolve();
  expect(callbacks.onTranscript).toHaveBeenCalledWith('Log an apple');
  expect(callbacks.onPhase).toHaveBeenLastCalledWith('idle');
});

it('uses MP4 when WebM is unsupported', async () => {
  Recorder.isTypeSupported.mockImplementation(
    (...args: unknown[]) => args[0] === 'audio/mp4'
  );
  await engine.start('voice-service', 'en');
  expect(Recorder.current.options.mimeType).toBe('audio/mp4');
});

it('cleans up permission requests that resolve after cancellation', async () => {
  let resolvePermission!: (value: MediaStream) => void;
  getUserMedia.mockReturnValueOnce(
    new Promise((resolve) => {
      resolvePermission = resolve;
    })
  );
  const start = engine.start('voice-service', 'en');
  engine.cancel();
  resolvePermission(stream);
  await start;
  expect(stopTrack).toHaveBeenCalled();
  expect(callbacks.transcribe).not.toHaveBeenCalled();
  expect(callbacks.onPhase).toHaveBeenLastCalledWith('idle');
});

it('aborts uploads and ignores a late successful response', async () => {
  let resolveUpload!: (value: { text: string }) => void;
  callbacks.transcribe.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveUpload = resolve;
    })
  );
  await engine.start('voice-service', 'en');
  engine.stop();
  const signal = callbacks.transcribe.mock.calls[0]![2];
  engine.cancel();
  expect(signal.aborted).toBe(true);
  resolveUpload({ text: 'Late transcript' });
  await Promise.resolve();
  expect(callbacks.onTranscript).not.toHaveBeenCalled();
  expect(callbacks.onError).not.toHaveBeenCalled();
});

it('stops oversized recordings without uploading', async () => {
  await engine.start('voice-service', 'en');
  Recorder.current.ondataavailable?.({
    data: new Blob([new Uint8Array(MAX_VOICE_UPLOAD_BYTES + 1)]),
  });
  expect(callbacks.onError).toHaveBeenCalledWith('tooLarge');
  expect(stopTrack).toHaveBeenCalled();
  expect(callbacks.transcribe).not.toHaveBeenCalled();
});

it('releases tracks when no supported recording format is available', async () => {
  Recorder.isTypeSupported.mockReturnValue(false);
  await engine.start('voice-service', 'en');
  expect(callbacks.onError).toHaveBeenCalledWith('unsupported');
  expect(stopTrack).toHaveBeenCalled();
});

it('cancels without uploading if the microphone is disconnected', async () => {
  await engine.start('voice-service', 'en');
  track.onended?.();
  expect(callbacks.onError).toHaveBeenCalledWith('failed');
  expect(callbacks.transcribe).not.toHaveBeenCalled();
  expect(stopTrack).toHaveBeenCalled();
});
