import { MAX_VOICE_UPLOAD_BYTES } from '@workspace/shared';

export type VoicePhase = 'idle' | 'starting' | 'recording' | 'processing';
export type VoiceError =
  'unsupported' | 'permission' | 'tooLarge' | 'noSpeech' | 'failed';

// Web Speech is not included in lib.dom in every supported TS version.
interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
export interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechConstructor = new () => BrowserSpeechRecognition;

function speechConstructor(): SpeechConstructor | undefined {
  const browser = window as Window & {
    SpeechRecognition?: SpeechConstructor;
    webkitSpeechRecognition?: SpeechConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

interface Callbacks {
  onPhase: (phase: VoicePhase) => void;
  onTranscript: (text: string) => void;
  onLevel: (level: number) => void;
  onError: (error: VoiceError) => void;
  transcribe: (
    audio: Blob,
    serviceId: string,
    signal: AbortSignal
  ) => Promise<{ text: string }>;
}

/** One foreground dictation session; cancellation invalidates every late callback. */
export class BrowserVoiceInput {
  private generation = 0;
  private phase: VoicePhase = 'idle';
  private speech: BrowserSpeechRecognition | null = null;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private upload: AbortController | null = null;
  private audioContext: AudioContext | null = null;
  private frame: number | null = null;
  private stopTimeout: number | null = null;

  constructor(private readonly callbacks: Callbacks) {}

  private setPhase(phase: VoicePhase) {
    this.phase = phase;
    this.callbacks.onPhase(phase);
  }

  private releaseMedia() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    void this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.callbacks.onLevel(0);
  }

  cancel() {
    ++this.generation;
    this.upload?.abort();
    this.upload = null;
    if (this.stopTimeout !== null) window.clearTimeout(this.stopTimeout);
    this.stopTimeout = null;
    if (this.speech) {
      this.speech.onend = this.speech.onerror = this.speech.onresult = null;
      this.speech.onspeechstart = this.speech.onspeechend = null;
      try {
        this.speech.abort();
      } catch {
        /* Already ended. */
      }
      this.speech = null;
    }
    if (this.recorder) {
      this.recorder.onstop =
        this.recorder.ondataavailable =
        this.recorder.onerror =
          null;
      try {
        if (this.recorder.state !== 'inactive') this.recorder.stop();
      } catch {
        /* Still release microphone tracks if the recorder has already ended. */
      }
      this.recorder = null;
    }
    this.releaseMedia();
    this.setPhase('idle');
  }

  private fail(generation: number, error: VoiceError) {
    if (generation !== this.generation) return;
    this.cancel();
    this.callbacks.onError(error);
  }

  private monitor(stream: MediaStream) {
    // Metering is optional. AudioContext may be unavailable or suspended by
    // browser autoplay policy; neither should prevent recording.
    try {
      const context = new AudioContext();
      this.audioContext = context;
      void context.resume().catch(() => {});
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let level = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(
          samples.reduce(
            (sum, sample) => sum + ((sample - 128) / 128) ** 2,
            0
          ) / samples.length
        );
        const target = Math.max(0, Math.min(1, (rms - 0.01) * 8));
        level += (target - level) * (target > level ? 0.4 : 0.1);
        this.callbacks.onLevel(level);
        this.frame = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* Keep the idle waveform when metering is unavailable. */
    }
  }

  async start(serviceId: string | null, language: string) {
    if (this.phase !== 'idle') return;
    const generation = ++this.generation;
    this.setPhase('starting');
    if (!serviceId) {
      const Recognition = speechConstructor();
      if (!Recognition) {
        this.fail(generation, 'unsupported');
        return;
      }
      let transcript = '';
      const recognition = new Recognition();
      this.speech = recognition;
      recognition.lang = language;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        if (generation === this.generation) {
          transcript = Array.from(
            event.results,
            (result) => result[0]?.transcript ?? ''
          )
            .join(' ')
            .trim();
        }
      };
      recognition.onspeechstart = () => this.callbacks.onLevel(0.7);
      recognition.onspeechend = () => this.callbacks.onLevel(0);
      recognition.onerror = (event) =>
        this.fail(
          generation,
          event.error === 'not-allowed' || event.error === 'service-not-allowed'
            ? 'permission'
            : event.error === 'no-speech'
              ? 'noSpeech'
              : 'failed'
        );
      recognition.onend = () => {
        if (generation !== this.generation) return;
        this.cancel();
        if (transcript) this.callbacks.onTranscript(transcript);
        else this.callbacks.onError('noSpeech');
      };
      try {
        recognition.start();
        if (generation === this.generation) this.setPhase('recording');
      } catch {
        this.fail(generation, 'failed');
      }
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      this.fail(generation, 'unsupported');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const mime = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime) {
        this.fail(generation, 'unsupported');
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      this.recorder = recorder;
      const chunks: Blob[] = [];
      let size = 0;
      recorder.ondataavailable = (event) => {
        if (generation !== this.generation) return;
        size += event.data.size;
        if (size > MAX_VOICE_UPLOAD_BYTES) {
          this.fail(generation, 'tooLarge');
          return;
        }
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => this.fail(generation, 'failed');
      recorder.onstop = async () => {
        if (generation !== this.generation) return;
        if (this.stopTimeout !== null) window.clearTimeout(this.stopTimeout);
        this.stopTimeout = null;
        this.releaseMedia();
        if (!size) {
          this.fail(generation, 'noSpeech');
          return;
        }
        this.setPhase('processing');
        const upload = new AbortController();
        this.upload = upload;
        try {
          const result = await this.callbacks.transcribe(
            new Blob(chunks, { type: mime }),
            serviceId,
            upload.signal
          );
          if (generation !== this.generation) return;
          this.cancel();
          this.callbacks.onTranscript(result.text);
        } catch {
          this.fail(generation, 'failed');
        }
      };
      stream.getTracks().forEach((track) => {
        track.onended = () => this.fail(generation, 'failed');
      });
      recorder.start(250);
      this.monitor(stream);
      this.setPhase('recording');
    } catch (error) {
      this.fail(
        generation,
        error instanceof DOMException && error.name === 'NotAllowedError'
          ? 'permission'
          : 'failed'
      );
    }
  }

  stop() {
    if (this.phase !== 'recording') return;
    this.setPhase('processing');
    const generation = this.generation;
    this.stopTimeout = window.setTimeout(
      () => this.fail(generation, 'failed'),
      10_000
    );
    try {
      if (this.recorder) this.recorder.stop();
      else this.speech?.stop();
    } catch {
      this.fail(generation, 'failed');
    }
  }
}
