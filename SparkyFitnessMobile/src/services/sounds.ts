import { AppState, Platform } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { addLog } from './LogService';

let restChimePlayer: AudioPlayer | null = null;
/** Key of the audio mode last applied, so a changed preference re-applies it. */
let configuredModeKey: string | null = null;
let intervalSessionActive = false;
let recordingCueSessionActive = false;

/**
 * Whether the rest-timer chime should play. Also consulted by the foreground
 * notification handler: while the chime owns the foreground cue, the
 * rest-complete notification's default sound is suppressed so the two never
 * ding on top of each other.
 */
export function isRestTimerSoundEnabled(): boolean {
  // Independent of `soundsEnabled`, which the settings UI presents as the
  // camera-shutter toggle.
  return useAppPreferencesStore.getState().restTimerSoundEnabled;
}

/**
 * Whether the chime ignores the ringer/silent switch (#2506). Only meaningful
 * while the chime itself is enabled.
 */
export function isRestChimeThroughSilentEnabled(): boolean {
  const prefs = useAppPreferencesStore.getState();
  return prefs.restTimerSoundEnabled && prefs.restChimeThroughSilent;
}

/**
 * Whether the chime also sounds with the app in the background. iOS only: a
 * silent keep-alive track holds the audio session open for the rest, so the
 * JS timer that plays the chime keeps running while the screen is locked.
 * Android keeps the notification ping as its background cue.
 */
export function isBackgroundRestChimeEnabled(): boolean {
  return Platform.OS === 'ios' && isRestChimeThroughSilentEnabled();
}

/**
 * Whether the chime would actually play right now. Callers that stand down in
 * favour of it must test this, not the preference alone: off screen the
 * notification ping owns the cue unless the background chime is on.
 */
export function willPlayRestCompleteSound(): boolean {
  return (
    isRestTimerSoundEnabled() &&
    (AppState.currentState === 'active' ||
      (isBackgroundRestChimeEnabled() && !keepAliveFailed))
  );
}

/**
 * Applies the audio mode the current preferences call for. Cues always mix
 * with (never duck, unless asked) the user's music. They respect the silent
 * switch unless an interval session is running or the user opted out of it,
 * and stay alive in the background only for the iOS background chime.
 */
async function applyBaseAudioMode({
  duck = false,
  force = false,
}: { duck?: boolean; force?: boolean } = {}): Promise<void> {
  const playsInSilentMode =
    intervalSessionActive ||
    recordingCueSessionActive ||
    isRestChimeThroughSilentEnabled();
  // A recording speaks with the screen locked; the location task keeps the
  // app running, so no keep-alive track is needed, only the session category.
  const shouldPlayInBackground =
    isBackgroundRestChimeEnabled() ||
    (recordingCueSessionActive && Platform.OS === 'ios');
  const interruptionMode = duck ? 'duckOthers' : 'mixWithOthers';
  const key = `${playsInSilentMode}|${shouldPlayInBackground}|${interruptionMode}`;
  if (!force && key === configuredModeKey) return;
  await setAudioModeAsync({
    playsInSilentMode,
    interruptionMode,
    // Only sent when on: iOS rejects background playback with the silent
    // switch respected, and leaving it out keeps expo-audio's default.
    ...(shouldPlayInBackground ? { shouldPlayInBackground } : {}),
  });
  configuredModeKey = key;
}

/**
 * Plays the rest-complete chime. Foreground-only unless the iOS background
 * chime is on — otherwise in the background the scheduled notification's sound
 * is the cue. Fire-and-forget: playback failures log but never propagate into
 * rest-state transitions.
 */
export function playRestCompleteSound(): void {
  if (!willPlayRestCompleteSound()) return;
  void (async () => {
    try {
      try {
        await applyBaseAudioMode();
      } catch (err) {
        // Retry on the next chime; a config failure must not mute the cue.
        addLog(
          `rest chime audio mode config failed: ${(err as Error).message}`,
          'WARNING'
        );
      }
      if (restChimePlayer == null) {
        restChimePlayer = createAudioPlayer(
          require('../../assets/sounds/rest-chime.wav')
        );
      }
      await restChimePlayer.seekTo(0);
      restChimePlayer.play();
    } catch (err) {
      addLog(
        `playRestCompleteSound failed: ${(err as Error).message}`,
        'ERROR'
      );
    }
  })();
}

let intervalWorkPlayer: AudioPlayer | null = null;
let intervalRestPlayer: AudioPlayer | null = null;

// --- Music ducking (#1560) ---------------------------------------------
//
// Opt-in: with `duckMusicDuringCues` off, nothing below runs and the audio
// session behaves exactly as before (cues mix over music at full volume).
// With it on, the session switches to `duckOthers` while a cue or guided
// line is sounding, then back to `mixWithOthers`. The session itself is never
// deactivated here: expo-audio already deactivates it (notifying other apps,
// which brings their volume back) once its players finish, and a manual
// `setIsAudioActiveAsync(false)` would pause and block the next cue.
// Depth-counted so overlapping cues (a beep during a spoken line) duck once
// and restore once.

/** Interval cue sounds are about a second; keep music low a touch longer. */
const CUE_DUCK_MS = 1200;
/** Grace period so back-to-back cues don't pump the music up and down. */
const UNDUCK_DELAY_MS = 600;

let duckDepth = 0;
let unduckTimer: ReturnType<typeof setTimeout> | null = null;
// Pending per-cue releases, cancelled on reset so a timer from a stopped
// session can't release a cue that belongs to the next one.
const cueReleaseTimers = new Set<ReturnType<typeof setTimeout>>();

function isDuckingEnabled(): boolean {
  return useAppPreferencesStore.getState().duckMusicDuringCues;
}

async function applyDuckMode(duck: boolean): Promise<void> {
  try {
    await applyBaseAudioMode({ duck, force: true });
  } catch (err) {
    addLog(`music ducking failed: ${(err as Error).message}`, 'WARNING');
  }
}

/**
 * Lower other apps' audio for a cue about to play. Returns true when ducking
 * started (the caller must then call {@link endCueDucking} exactly once).
 */
export function beginCueDucking(): boolean {
  if (!isDuckingEnabled()) return false;
  if (unduckTimer != null) {
    clearTimeout(unduckTimer);
    unduckTimer = null;
  }
  duckDepth += 1;
  if (duckDepth === 1) void applyDuckMode(true);
  return true;
}

/** Release one {@link beginCueDucking}; the last release restores the music. */
export function endCueDucking(): void {
  if (duckDepth === 0) return;
  duckDepth -= 1;
  if (duckDepth > 0) return;
  unduckTimer = setTimeout(() => {
    unduckTimer = null;
    if (duckDepth === 0) void applyDuckMode(false);
  }, UNDUCK_DELAY_MS);
}

function resetDucking(): void {
  cueReleaseTimers.forEach((timer) => clearTimeout(timer));
  cueReleaseTimers.clear();
  duckDepth = 0;
  if (unduckTimer != null) {
    clearTimeout(unduckTimer);
    unduckTimer = null;
  }
}

/**
 * Starts an audio session configured for interval workouts (`playsInSilentMode: true`).
 * This ensures cues are audible mid-workout even if the phone's silent switch is on.
 */
export async function startIntervalAudioSession(): Promise<void> {
  intervalSessionActive = true;
  try {
    await applyBaseAudioMode({ force: true });
  } catch (err) {
    addLog(
      `startIntervalAudioSession failed: ${(err as Error).message}`,
      'WARNING'
    );
  }
}

/**
 * Ends the interval audio session, restoring the standard audio mode.
 */
export async function stopIntervalAudioSession(): Promise<void> {
  intervalSessionActive = false;
  resetDucking();
  try {
    // Back to the base mode, which keeps silent-mode and background playback
    // on when the rest chime needs them.
    await applyBaseAudioMode({ force: true });
  } catch (err) {
    addLog(
      `stopIntervalAudioSession failed: ${(err as Error).message}`,
      'WARNING'
    );
  }
}

/**
 * Configures the audio session for spoken cues during a GPS recording: audible
 * with the silent switch on and, on iOS, with the screen locked.
 */
export async function startRecordingCueSession(): Promise<void> {
  recordingCueSessionActive = true;
  try {
    await applyBaseAudioMode({ force: true });
  } catch (err) {
    addLog(
      `startRecordingCueSession failed: ${(err as Error).message}`,
      'WARNING'
    );
  }
}

/** Restores the standard audio mode once the recording ends. */
export async function stopRecordingCueSession(): Promise<void> {
  if (!recordingCueSessionActive) return;
  recordingCueSessionActive = false;
  try {
    await applyBaseAudioMode({ force: true });
  } catch (err) {
    addLog(
      `stopRecordingCueSession failed: ${(err as Error).message}`,
      'WARNING'
    );
  }
}

/**
 * Plays a sound cue for interval transitions (work, rest, countdown beep, or workout finish).
 */
export function playIntervalCue(
  type: 'work' | 'rest' | 'countdown' | 'finish'
): void {
  if (!isRestTimerSoundEnabled()) return;
  if (beginCueDucking()) {
    const release = setTimeout(() => {
      cueReleaseTimers.delete(release);
      endCueDucking();
    }, CUE_DUCK_MS);
    cueReleaseTimers.add(release);
  }
  void (async () => {
    try {
      if (type === 'work' || type === 'finish') {
        if (intervalWorkPlayer == null) {
          intervalWorkPlayer = createAudioPlayer(
            require('../../assets/sounds/rest-chime.wav')
          );
        }
        await intervalWorkPlayer.seekTo(0);
        intervalWorkPlayer.play();
      } else {
        if (intervalRestPlayer == null) {
          intervalRestPlayer = createAudioPlayer(
            require('../../assets/sounds/rest-chime-2.wav')
          );
        }
        await intervalRestPlayer.seekTo(0);
        intervalRestPlayer.play();
      }
    } catch (err) {
      addLog(
        `playIntervalCue (${type}) failed: ${(err as Error).message}`,
        'ERROR'
      );
    }
  })();
}

// --- Background rest chime (#2506) ---------------------------------------
//
// iOS suspends a backgrounded app within seconds, which also stops the rest
// deadline timer that flips the rest to ready and plays the chime. While a rest
// runs and the user opted in, a silent track loops to keep the audio session
// (and with it the JS thread) alive, so that timer fires on time off screen and
// the chime plays through the silent switch. The loop mixes with other audio,
// so it never pauses the user's music.

/** Long enough for the chime to start and finish before the loop lets go. */
const CHIME_TAIL_MS = 2500;

let keepAlivePlayer: AudioPlayer | null = null;
let keepAliveStopTimer: ReturnType<typeof setTimeout> | null = null;
let keepAliveWanted = false;
// The latest keep-alive start, resolving to whether it holds the app awake.
let keepAliveStartup: Promise<boolean> | null = null;
// Whether the latest keep-alive start failed (iOS rejected the background
// audio mode). Off screen the chime then cannot sound, so the notification
// ping must keep its own.
let keepAliveFailed = false;

function stopKeepAlive(): void {
  if (keepAliveStopTimer != null) {
    clearTimeout(keepAliveStopTimer);
    keepAliveStopTimer = null;
  }
  try {
    keepAlivePlayer?.pause();
  } catch (err) {
    addLog(`rest keep-alive stop failed: ${(err as Error).message}`, 'WARNING');
  }
}

/**
 * Hold the app awake for a running rest (`true`) or let it go (`false`). Safe
 * to call on every rest-state change. Letting go waits out the chime's tail:
 * the chime starts asynchronously after the rest flips to ready, and iOS would
 * suspend the app in that gap if nothing were playing. Does nothing unless the
 * iOS background chime is enabled.
 */
export function setRestKeepAlive(active: boolean): void {
  keepAliveWanted = active && isBackgroundRestChimeEnabled();
  if (!keepAliveWanted) {
    if (keepAlivePlayer != null && keepAliveStopTimer == null) {
      keepAliveStopTimer = setTimeout(stopKeepAlive, CHIME_TAIL_MS);
    }
    return;
  }
  if (keepAliveStopTimer != null) {
    clearTimeout(keepAliveStopTimer);
    keepAliveStopTimer = null;
  }
  keepAliveStartup = (async () => {
    try {
      await applyBaseAudioMode();
      if (keepAlivePlayer == null) {
        keepAlivePlayer = createAudioPlayer(
          require('../../assets/sounds/silence.wav')
        );
        keepAlivePlayer.loop = true;
      }
      keepAliveFailed = false;
      // Released while the audio mode was being applied.
      if (!keepAliveWanted) return true;
      if (!keepAlivePlayer.playing) keepAlivePlayer.play();
      return true;
    } catch (err) {
      keepAliveFailed = true;
      addLog(
        `rest keep-alive start failed: ${(err as Error).message}`,
        'WARNING'
      );
      return false;
    }
  })();
}

/**
 * Whether the chime will sound for a rest even off screen, so the rest
 * notification can go silent. Waits for a keep-alive start in flight: when iOS
 * rejects the background audio mode nothing holds the app awake, and the
 * notification must keep its sound.
 */
export async function willBackgroundRestChimeSound(): Promise<boolean> {
  if (!isBackgroundRestChimeEnabled()) return false;
  return keepAliveStartup == null ? true : keepAliveStartup;
}

/** Test-only helper — drops the cached player and audio-mode flag. */
export function __resetSoundsForTests(): void {
  restChimePlayer = null;
  intervalWorkPlayer = null;
  intervalRestPlayer = null;
  configuredModeKey = null;
  intervalSessionActive = false;
  recordingCueSessionActive = false;
  stopKeepAlive();
  keepAlivePlayer = null;
  keepAliveWanted = false;
  keepAliveStartup = null;
  keepAliveFailed = false;
  resetDucking();
}
