import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  advanceWorkoutVideo,
  buildWorkoutVideoTimeline,
  buildWorkoutVideoDocument,
  createWorkoutVideoTracker,
  getWorkoutVideoPosition,
  hasInvalidWorkoutVideoTiming,
  hasOverlappingWorkoutVideoTimings,
  parseWorkoutVideoUrl,
  readWorkoutVideoPlaybackMessage,
  workoutPresetCreateRequestSchema,
  workoutPresetUpdateRequestSchema,
} from '@workspace/shared';

const timeline = [
  { exerciseIndex: 1, start_seconds: 5, end_seconds: 15 },
  { exerciseIndex: 0, start_seconds: 20, end_seconds: 30 },
];

describe('follow-along workout video', () => {
  it('accepts common YouTube links and direct HTTP(S) video URLs', () => {
    expect(parseWorkoutVideoUrl('https://youtu.be/H6x1X1A2HjA?t=10')).toEqual({
      kind: 'youtube',
      id: 'H6x1X1A2HjA',
    });
    expect(
      parseWorkoutVideoUrl('https://www.youtube.com/watch?v=H6x1X1A2HjA')
    ).toEqual({ kind: 'youtube', id: 'H6x1X1A2HjA' });
    expect(parseWorkoutVideoUrl('https://videos.example/workout.mp4')).toEqual({
      kind: 'file',
      url: 'https://videos.example/workout.mp4',
    });
  });

  it.each([
    'javascript:alert(1)',
    'https://secret@example.com/video.mp4',
    'https://www.youtube.com/playlist?list=workouts',
  ])('rejects an unusable source (%s)', (url) => {
    expect(parseWorkoutVideoUrl(url)).toBeNull();
  });

  it('validates intervals and orders them by video time', () => {
    expect(
      hasInvalidWorkoutVideoTiming({
        video_start_seconds: 15,
        video_end_seconds: 5,
      })
    ).toBe(true);
    expect(
      buildWorkoutVideoTimeline([
        { video_start_seconds: 20, video_end_seconds: 30 },
        { video_start_seconds: 5, video_end_seconds: 15 },
      ])
    ).toEqual(timeline);
    expect(
      hasOverlappingWorkoutVideoTimings([
        { video_start_seconds: 5, video_end_seconds: 15 },
        { video_start_seconds: 14, video_end_seconds: 30 },
      ])
    ).toBe(true);
  });

  it('shows the active exercise, the next exercise and remaining time from the playhead', () => {
    expect(getWorkoutVideoPosition(timeline, 8)).toEqual({
      current: timeline[0],
      next: timeline[1],
      remainingSeconds: 7,
      progress: 8 / 30,
    });
    expect(getWorkoutVideoPosition(timeline, 15)).toEqual({
      current: null,
      next: timeline[1],
      remainingSeconds: 0,
      progress: 0.5,
    });
  });

  it('counts an exercise only when playback covers its entire interval', () => {
    const first = advanceWorkoutVideo(timeline, [], { start: 4, end: 12 });
    expect(first.completedIndexes).toEqual([]);
    const second = advanceWorkoutVideo(timeline, first.played, {
      start: 12,
      end: 17,
    });
    expect(second.completedIndexes).toEqual([1]);
    const third = advanceWorkoutVideo(timeline, second.played, {
      start: 25,
      end: 31,
    });
    expect(third.completedIndexes).toEqual([1]);
    expect(
      advanceWorkoutVideo(timeline, third.played, { start: 20, end: 25 })
        .completedIndexes
    ).toEqual([1, 0]);
  });

  it('keeps video data in saved presets and rejects incomplete or overlapping timestamps', () => {
    const data = {
      name: 'Follow along',
      video_url: 'https://youtu.be/H6x1X1A2HjA',
      exercises: [
        {
          exercise_id: 'stretch',
          video_start_seconds: 0,
          video_end_seconds: 8,
        },
        {
          exercise_id: 'stretch',
          video_start_seconds: 8,
          video_end_seconds: 12,
        },
      ],
    };
    expect(workoutPresetCreateRequestSchema.parse(data)).toMatchObject(data);
    expect(workoutPresetUpdateRequestSchema.parse({ video_url: null })).toEqual(
      {
        video_url: null,
      }
    );
    expect(
      workoutPresetCreateRequestSchema.safeParse({
        ...data,
        exercises: [
          ...data.exercises,
          { exercise_id: 'rest', video_start_seconds: 7, video_end_seconds: 9 },
        ],
      }).success
    ).toBe(false);
    expect(
      workoutPresetUpdateRequestSchema.safeParse({
        exercises: [{ exercise_id: 'stretch', video_start_seconds: 8 }],
      }).success
    ).toBe(false);
  });

  it('emits completion and end only once for repeated player messages', () => {
    const track = createWorkoutVideoTracker();
    const key = (index: number) => String(index);
    expect(
      track(
        timeline,
        { workoutVideo: true, token: 'test-player', seconds: 18 },
        key
      )
    ).toEqual({
      completedIndexes: [],
      ended: false,
    });
    const end = {
      workoutVideo: true,
      token: 'test-player',
      seconds: 30,
      ended: true,
      ranges: [{ start: 4, end: 17 }],
    } as const;
    expect(
      readWorkoutVideoPlaybackMessage(JSON.stringify(end), 'other-player')
    ).toBeNull();
    const message = readWorkoutVideoPlaybackMessage(
      JSON.stringify(end),
      'test-player'
    )!;
    expect(track(timeline, message, key)).toEqual({
      completedIndexes: [1],
      ended: true,
    });
    expect(track(timeline, message, key)).toEqual({
      completedIndexes: [],
      ended: false,
    });
  });

  it('passes source data to the embedded document without creating new markup', () => {
    const document = buildWorkoutVideoDocument(
      { kind: 'file', url: 'https://videos.example/workout.mp4' },
      'https://example.com',
      '</script><video autoplay>',
      'test-player'
    );
    expect(document).not.toContain('</script><video autoplay>');
    expect(document.match(/<script>/g)).toHaveLength(1);
  });

  it('uses the last cued time when YouTube reports PLAYING after the first frame', () => {
    const html = buildWorkoutVideoDocument(
      { kind: 'youtube', id: 'H6x1X1A2HjA' },
      'https://example.com',
      'Workout video',
      'test-player'
    );
    const script = /<script>([\s\S]+)<\/script>/.exec(html)?.[1];
    expect(script).toBeDefined();

    let seconds = 0;
    let now = 0;
    let onPlaying: (() => void) | undefined;
    const messages: unknown[] = [];
    const player = {
      getCurrentTime: () => seconds,
      getPlaybackRate: () => 1,
      getIframe: () => ({}),
    };
    const window = {
      onYouTubeIframeAPIReady: () => undefined,
      parent: {
        postMessage: (data: string) => messages.push(JSON.parse(data)),
      },
      YT: {
        Player: class {
          constructor(
            _element: object,
            options: {
              events: {
                onReady: (event: { target: typeof player }) => void;
                onStateChange: (event: { data: number }) => void;
              };
            }
          ) {
            onPlaying = () => options.events.onStateChange({ data: 1 });
            queueMicrotask(() => options.events.onReady({ target: player }));
            Object.assign(this, player);
          }
        },
        PlayerState: { PLAYING: 1, ENDED: 0 },
      },
    };
    runInNewContext(script!, {
      window,
      document: {
        createElement: () => ({}),
        body: { append() {} },
        head: { append() {} },
      },
      performance: { now: () => now },
      setInterval: () => 1,
    });
    window.onYouTubeIframeAPIReady();
    return Promise.resolve().then(() => {
      now = 330;
      seconds = 0.3;
      onPlaying?.();
      expect(messages.at(-1)).toMatchObject({
        ranges: [{ start: 0, end: 0.3 }],
      });
    });
  });
});
