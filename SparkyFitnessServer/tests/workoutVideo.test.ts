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

  it('tracks YouTube playback through buffering, clock corrections and speed changes', async () => {
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
    let rate = 1;
    let changeState: ((state: number) => void) | undefined;
    let changeRate: ((rate: number) => void) | undefined;
    let pollClock: (() => void) | undefined;
    const messages: unknown[] = [];
    const playerState = { PLAYING: 1, ENDED: 0, PAUSED: 2, BUFFERING: 3 };
    const player = {
      getCurrentTime: () => seconds,
      getPlaybackRate: () => rate,
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
                onPlaybackRateChange: (event: { data: number }) => void;
              };
            }
          ) {
            changeState = (data) => options.events.onStateChange({ data });
            changeRate = (data) => {
              rate = data;
              options.events.onPlaybackRateChange({ data });
            };
            queueMicrotask(() => options.events.onReady({ target: player }));
            Object.assign(this, player);
          }
        },
        PlayerState: playerState,
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
      setInterval: (callback: () => void) => {
        pollClock = callback;
        return 1;
      },
    });
    window.onYouTubeIframeAPIReady();
    await Promise.resolve();

    function sample(at: number, position: number, state?: number) {
      now = at;
      seconds = position;
      if (state === undefined) pollClock?.();
      else changeState?.(state);
      return messages.at(-1);
    }

    sample(990, 0);
    expect(sample(1000, 0.3, playerState.PLAYING)).toMatchObject({
      ranges: [{ start: 0, end: 0.3 }],
    });
    sample(1200, 0.5);
    sample(1400, 0.51);
    sample(1600, 0.52);
    expect(sample(1800, 1.08)).toMatchObject({
      ranges: [{ start: 0.52, end: 1.08 }],
    });
    expect(sample(1810, 0.8)).toMatchObject({ ranges: [] });
    expect(sample(2010, 1.28)).toMatchObject({
      ranges: [{ start: 1.08, end: 1.28 }],
    });
    sample(2110, 1.38, playerState.BUFFERING);
    sample(2870, 1.38);
    expect(sample(2880, 1.76, playerState.PLAYING)).toMatchObject({
      ranges: [{ start: 1.38, end: 1.76 }],
    });
    sample(3080, 1.96);
    expect(sample(3290, 7)).toMatchObject({ seconds: 7, ranges: [] });
    expect(sample(3490, 7.2)).toMatchObject({
      ranges: [{ start: 7, end: 7.2 }],
    });
    sample(3590, 7.3, playerState.PAUSED);
    expect(sample(3890, 12)).toMatchObject({ seconds: 12, ranges: [] });
    expect(sample(4090, 12.12, playerState.PLAYING)).toMatchObject({
      ranges: [{ start: 12, end: 12.12 }],
    });
    expect(sample(4215, 12.37)).toMatchObject({
      seconds: 12.37,
      ranges: [{ start: 12.12, end: expect.closeTo(12.245) }],
    });
    sample(4500, 12.4, playerState.PAUSED);
    sample(4510, 12.4, playerState.BUFFERING);
    expect(sample(4625, 12.65, playerState.PLAYING)).toMatchObject({
      seconds: 12.65,
      ranges: [{ start: 12.4, end: expect.closeTo(12.515, 3) }],
    });
    sample(5000, 50);
    now = 5010;
    seconds = 50.01;
    changeRate?.(2);
    now = 5160;
    seconds = 50.31;
    changeRate?.(0.25);
    expect(messages.at(-1)).toMatchObject({
      ranges: [{ start: expect.closeTo(50.01), end: expect.closeTo(50.31) }],
    });
    expect(sample(5360, 50.36)).toMatchObject({
      ranges: [{ start: expect.closeTo(50.31), end: expect.closeTo(50.36) }],
    });

    const beforeEnd = messages.length;
    sample(7700, 51, playerState.ENDED);
    expect(messages.slice(beforeEnd)).toContainEqual(
      expect.objectContaining({
        ended: true,
        ranges: [{ start: expect.closeTo(50.36), end: 51 }],
      })
    );

    sample(8000, 0);
    sample(8050, 0, playerState.PLAYING);
    const beforeJumpToEnd = messages.length;
    sample(8200, 51, playerState.ENDED);
    expect(messages.slice(beforeJumpToEnd)).not.toContainEqual(
      expect.objectContaining({
        ranges: expect.arrayContaining([expect.anything()]),
      })
    );
  });
});
