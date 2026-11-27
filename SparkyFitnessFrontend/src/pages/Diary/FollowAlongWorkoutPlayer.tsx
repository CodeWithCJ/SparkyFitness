import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildWorkoutVideoDocument,
  buildWorkoutVideoTimeline,
  createWorkoutVideoTracker,
  getWorkoutVideoPosition,
  parseWorkoutVideoUrl,
  readWorkoutVideoPlaybackMessage,
  type WorkoutVideoTiming,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatSecondsClock } from '@/utils/timeFormatters';
import { generateClientId } from '@/utils/generateClientId';

interface Props {
  url: string;
  exercises: readonly (WorkoutVideoTiming & { exercise_name: string })[];
  onComplete: (exerciseIndexes: readonly number[], ended: boolean) => void;
}

export default function FollowAlongWorkoutPlayer({
  url,
  exercises,
  onComplete,
}: Props) {
  const { t } = useTranslation();
  const title = t('exercise.workoutVideo.title', 'Follow-along video');
  const source = useMemo(() => parseWorkoutVideoUrl(url), [url]);
  const timeline = useMemo(
    () => buildWorkoutVideoTimeline(exercises),
    [exercises]
  );
  const [enabled, setEnabled] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [failed, setFailed] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [track] = useState(createWorkoutVideoTracker);
  const [token] = useState(generateClientId);
  const videoDocument = useMemo(
    () =>
      source
        ? buildWorkoutVideoDocument(
            source,
            window.location.origin,
            title,
            token
          )
        : undefined,
    [source, title, token]
  );

  useEffect(() => {
    function onMessage(event: MessageEvent<unknown>) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = readWorkoutVideoPlaybackMessage(event.data, token);
      if (!message) return;
      if (message.error) {
        setFailed(true);
        return;
      }
      if (message.seconds != null) setSeconds(message.seconds);
      const { completedIndexes, ended } = track(
        timeline,
        message,
        (index) => index
      );
      if (completedIndexes.length || ended) onComplete(completedIndexes, ended);
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [timeline, onComplete, track, token]);

  const position = getWorkoutVideoPosition(timeline, seconds);
  const current = position.current
    ? exercises[position.current.exerciseIndex]
    : null;
  const next = position.next ? exercises[position.next.exerciseIndex] : null;
  const progress = Math.round(position.progress * 100);
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {timeline.length > 0 && (
            <span className="text-sm tabular-nums text-muted-foreground">
              {t('exercise.workoutVideo.progress', '{{progress}}% of workout', {
                progress,
              })}
            </span>
          )}
        </div>
        {failed || !source ? (
          <p role="alert" className="text-sm text-destructive">
            {t(
              'exercise.workoutVideo.unavailable',
              'The video could not be played. You can still log this workout manually.'
            )}
          </p>
        ) : enabled ? (
          <iframe
            ref={frameRef}
            title={title}
            srcDoc={videoDocument}
            sandbox={
              source.kind === 'file'
                ? 'allow-scripts allow-presentation'
                : undefined
            }
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="aspect-video max-h-[52dvh] min-h-[200px] w-full rounded-md bg-black"
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setEnabled(true)}
          >
            {t('exercise.workoutVideo.load', 'Load video')}
          </Button>
        )}
        {timeline.length > 0 && (
          <>
            <Progress
              value={progress}
              aria-label={t(
                'exercise.workoutVideo.progressLabel',
                'Workout progress'
              )}
            />
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1">
              <div>
                <p className="text-xs text-muted-foreground">
                  {t('exercise.workoutVideo.now', 'Current exercise')}
                </p>
                <p className="font-semibold">
                  {current?.exercise_name ??
                    t('exercise.workoutVideo.noCurrent', 'Between exercises')}
                </p>
              </div>
              {current && (
                <p
                  className="font-mono text-2xl tabular-nums"
                  aria-label={t(
                    'exercise.workoutVideo.remaining',
                    'Time remaining'
                  )}
                >
                  {formatSecondsClock(position.remainingSeconds)}
                </p>
              )}
              {next && (
                <p className="col-span-2 text-sm text-muted-foreground">
                  {t('exercise.workoutVideo.next', 'Next: {{exercise}}', {
                    exercise: next.exercise_name,
                  })}
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
