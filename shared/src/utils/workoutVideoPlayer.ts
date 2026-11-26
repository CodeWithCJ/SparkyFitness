import { z } from 'zod';
import {
  advanceWorkoutVideo,
  type buildWorkoutVideoTimeline,
  type WorkoutVideoRange,
  type WorkoutVideoSource,
} from './workoutVideo.ts';

const playbackMessageSchema = z.object({
  workoutVideo: z.literal(true),
  token: z.string(),
  error: z.literal(true).optional(),
  seconds: z.number().finite().nonnegative().optional(),
  ended: z.boolean().optional(),
  ranges: z
    .array(
      z.object({
        start: z.number().finite().nonnegative(),
        end: z.number().finite().nonnegative(),
      })
    )
    .optional(),
});

export type WorkoutVideoPlaybackMessage = z.infer<typeof playbackMessageSchema>;

export function readWorkoutVideoPlaybackMessage(
  value: unknown,
  token: string
): WorkoutVideoPlaybackMessage | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = playbackMessageSchema.safeParse(JSON.parse(value));
    return parsed.success && parsed.data.token === token ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createWorkoutVideoTracker() {
  let played: WorkoutVideoRange[] = [];
  const completed = new Set<string | number>();
  let hasEnded = false;

  return (
    timeline: ReturnType<typeof buildWorkoutVideoTimeline>,
    message: WorkoutVideoPlaybackMessage,
    exerciseKey: (index: number) => string | number
  ) => {
    const completedIndexes: number[] = [];
    for (const range of message.ranges ?? []) {
      const result = advanceWorkoutVideo(timeline, played, range);
      played = result.played;
      for (const index of result.completedIndexes) {
        const key = exerciseKey(index);
        if (!completed.has(key)) {
          completed.add(key);
          completedIndexes.push(index);
        }
      }
    }
    const ended = message.ended === true && !hasEnded;
    hasEnded = message.ended === true;
    return { completedIndexes, ended };
  };
}

/**
 * A small document shared by the web iframe and the native WebView. Dynamic
 * values are escaped for a JSON script literal. Hosted sources are only ever
 * assigned to a video element and YouTube IDs are parsed before getting here.
 */
export function buildWorkoutVideoDocument(
  source: WorkoutVideoSource,
  origin: string,
  title: string,
  token: string
): string {
  const config = JSON.stringify({ source, origin, title, token }).replaceAll(
    '<',
    '\\u003c'
  );
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://www.youtube.com https://s.ytimg.com; style-src 'unsafe-inline'; media-src http: https:; frame-src https://www.youtube.com; base-uri 'none'; form-action 'none'">
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
  video, iframe, #player { width: 100%; height: 100%; display: block; border: 0; }
</style>
</head>
<body>
<script>
const config = ${config};
const send = (message) => {
  const json = JSON.stringify({ workoutVideo: true, token: config.token, ...message });
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(json);
  else window.parent.postMessage(json, config.origin);
};

if (config.source.kind === 'file') {
  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = config.source.url;
  window.pauseWorkoutVideo = () => video.pause();
  const publish = () => send({
    seconds: video.currentTime,
    ended: video.ended,
    ranges: Array.from({ length: video.played.length }, (_, i) => ({
      start: video.played.start(i), end: video.played.end(i),
    })),
  });
  for (const event of ['loadedmetadata', 'timeupdate', 'seeking', 'seeked', 'pause', 'ended']) {
    video.addEventListener(event, publish);
  }
  video.addEventListener("error", () => send({ error: true }));
  document.body.append(video);
} else {
  const target = document.createElement("div");
  target.id = "player";
  document.body.append(target);
  let player;
  let previous = null;
  let playbackRate = 1;
  let playing = false;
  let pausedBeforePlay = false;
  let timer;
  window.pauseWorkoutVideo = () => player?.pauseVideo?.();
  const report = (ended = false, resumed = false) => {
    if (!player || !player.getCurrentTime) return;
    const seconds = player.getCurrentTime();
    const now = performance.now();
    const ranges = [];
    const sample = { seconds, now, expected: seconds, playedUntil: seconds };
    if (playing && previous) {
      const elapsed = (now - previous.now) / 1000;
      const elapsedPlayback = resumed ? Math.min(elapsed, 0.2) : elapsed;
      let expected = previous.expected + elapsedPlayback * playbackRate;
      // Allow for a late PLAYING event at startup or after buffering.
      // A seek from an explicit pause gets only the elapsed playback time.
      const startupAllowance = pausedBeforePlay ? 0 : 0.5 * playbackRate;
      if (resumed && seconds <= expected + startupAllowance) {
        expected = seconds;
      }
      // Small backwards corrections occur as the player clock settles.
      // Carry at most one second of playback between reports. A larger
      // discontinuity starts a new range at the reported position.
      if (
        seconds >= previous.seconds - 0.5 * playbackRate &&
        seconds <= expected + 0.2
      ) {
        sample.expected = Math.min(expected, seconds + playbackRate);
        // The end event confirms the final fraction of continuous playback.
        const playedUntil = ended ? seconds : Math.min(seconds, expected);
        sample.playedUntil = Math.max(previous.playedUntil, playedUntil);
        if (playedUntil > previous.playedUntil) {
          ranges.push({ start: previous.playedUntil, end: playedUntil });
        }
      }
    } else if (previous && Math.abs(seconds - previous.seconds) < 0.05) {
      // Keep the end of the last confirmed range across a stationary pause.
      sample.playedUntil = previous.playedUntil;
    }
    previous = sample;
    send({ seconds, ended, ranges });
  };
  const fail = () => {
    clearInterval(timer);
    send({ error: true });
  };
  window.onYouTubeIframeAPIReady = () => {
    player = new window.YT.Player(target, {
      videoId: config.source.id,
      width: "100%",
      height: "100%",
      playerVars: {
        playsinline: 1,
        widget_referrer: config.origin,
        ...(window.origin === 'null' ? {} : { origin: config.origin }),
      },
      events: {
        onReady: (event) => {
          const iframe = event.target.getIframe();
          iframe.title = config.title;
          playbackRate = event.target.getPlaybackRate() || 1;
          timer = setInterval(() => report(), 200);
          report();
        },
        onStateChange: (event) => {
          const ended = event.data === window.YT.PlayerState.ENDED;
          const wasPlaying = playing;
          if (wasPlaying) report(ended);
          playing = event.data === window.YT.PlayerState.PLAYING;
          if (event.data === window.YT.PlayerState.PAUSED) pausedBeforePlay = true;
          report(ended, playing && !wasPlaying);
          if (playing) pausedBeforePlay = false;
        },
        onPlaybackRateChange: (event) => {
          report();
          playbackRate = event.data;
        },
        onError: fail,
      },
    });
  };
  const api = document.createElement("script");
  api.src = "https://www.youtube.com/iframe_api";
  api.onerror = fail;
  document.head.append(api);
}
</script>
</body>
</html>`;
}
