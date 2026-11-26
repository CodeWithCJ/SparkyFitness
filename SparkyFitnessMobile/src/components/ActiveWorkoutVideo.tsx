import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { applicationId } from 'expo-application';
import { randomUUID } from 'expo-crypto';
import { useTranslation } from 'react-i18next';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  buildWorkoutVideoDocument,
  buildWorkoutVideoTimeline,
  createWorkoutVideoTracker,
  getWorkoutVideoPosition,
  parseWorkoutVideoUrl,
  readWorkoutVideoPlaybackMessage,
  type WorkoutVideoTiming,
} from '@workspace/shared';
import { formatDurationSeconds } from '../utils/workoutSession';

interface VideoExercise extends WorkoutVideoTiming {
  id: string;
  name: string;
}
interface Props {
  url: string;
  isFocused: boolean;
  exercises: readonly VideoExercise[];
  onComplete: (exerciseIds: readonly string[], ended: boolean) => void;
}

export default function ActiveWorkoutVideo({
  url,
  exercises,
  isFocused,
  onComplete,
}: Props) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [track] = useState(createWorkoutVideoTracker);
  const [token] = useState(randomUUID);
  const webView = useRef<WebView<unknown>>(null);
  const title = t('workoutVideo.title', { defaultValue: 'Follow-along video' });
  const origin = `https://${applicationId ?? 'com.sparkyfitness.app'}`;
  const source = useMemo(() => parseWorkoutVideoUrl(url), [url]);
  const documentSource = useMemo(
    () =>
      source
        ? {
            html: buildWorkoutVideoDocument(source, origin, title, token),
            baseUrl: origin,
          }
        : null,
    [source, origin, title, token]
  );
  const timeline = useMemo(
    () => buildWorkoutVideoTimeline(exercises),
    [exercises]
  );

  useEffect(() => {
    if (!enabled) return;
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        webView.current?.injectJavaScript(
          'window.pauseWorkoutVideo?.(); true;'
        );
      }
    });
    return () => listener.remove();
  }, [enabled]);

  useEffect(() => {
    if (!isFocused)
      webView.current?.injectJavaScript('window.pauseWorkoutVideo?.(); true;');
  }, [isFocused]);

  function handleMessage(event: WebViewMessageEvent) {
    const message = readWorkoutVideoPlaybackMessage(
      event.nativeEvent.data,
      token
    );
    if (!message) return;
    if (message.error) {
      setFailed(true);
      return;
    }
    if (message.seconds != null) setSeconds(message.seconds);
    const { completedIndexes, ended } = track(
      timeline,
      message,
      (index) => exercises[index].id
    );
    if (completedIndexes.length || ended) {
      onComplete(
        completedIndexes.map((index) => exercises[index].id),
        ended
      );
    }
  }

  const position = getWorkoutVideoPosition(timeline, seconds);
  const current = position.current
    ? exercises[position.current.exerciseIndex]
    : null;
  const next = position.next ? exercises[position.next.exerciseIndex] : null;
  const progress = Math.round(position.progress * 100);
  return (
    <View className="mb-3 gap-3 rounded-2xl border border-border bg-surface p-3">
      <View className="flex-row flex-wrap items-baseline justify-between gap-2">
        <Text className="text-base font-semibold text-text-primary">
          {title}
        </Text>
        {timeline.length > 0 && (
          <Text className="text-xs text-text-secondary">
            {t('workoutVideo.progress', {
              defaultValue: '{{progress}}% of workout',
              progress,
            })}
          </Text>
        )}
      </View>
      {failed || !documentSource ? (
        <Text accessibilityRole="alert" className="text-sm text-text-secondary">
          {t('workoutVideo.unavailable', {
            defaultValue:
              'The video could not be played. You can still log this workout manually.',
          })}
        </Text>
      ) : enabled ? (
        <View
          className="overflow-hidden rounded-lg"
          style={{ aspectRatio: 16 / 9, minHeight: 200 }}
        >
          <WebView<unknown>
            ref={webView}
            accessibilityLabel={title}
            source={documentSource}
            originWhitelist={['https://*', 'http://*', 'about:blank']}
            onShouldStartLoadWithRequest={(request) =>
              !request.isTopFrame ||
              request.url === 'about:blank' ||
              request.url === origin ||
              request.url === `${origin}/`
            }
            javaScriptCanOpenWindowsAutomatically={false}
            setSupportMultipleWindows={false}
            allowFileAccess={false}
            mixedContentMode={
              source?.kind === 'file' && source.url.startsWith('http:')
                ? 'always'
                : 'never'
            }
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction
            scrollEnabled={false}
            onMessage={handleMessage}
            onError={() => setFailed(true)}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          className="self-start rounded-lg border border-border px-3 py-2"
          onPress={() => setEnabled(true)}
        >
          <Text className="font-medium text-text-primary">
            {t('workoutVideo.load', { defaultValue: 'Load video' })}
          </Text>
        </Pressable>
      )}
      {timeline.length > 0 && (
        <>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={t('workoutVideo.progressLabel', {
              defaultValue: 'Workout progress',
            })}
            accessibilityValue={{ min: 0, max: 100, now: progress }}
            className="h-2 overflow-hidden rounded-full bg-border"
          >
            <View
              className="h-full rounded-full bg-accent-primary"
              style={{ width: `${progress}%` }}
            />
          </View>
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text className="text-xs text-text-secondary">
                {t('workoutVideo.now', { defaultValue: 'Current exercise' })}
              </Text>
              <Text className="font-semibold text-text-primary">
                {current?.name ??
                  t('workoutVideo.noCurrent', {
                    defaultValue: 'Between exercises',
                  })}
              </Text>
            </View>
            {current && (
              <Text
                accessibilityLabel={t('workoutVideo.remaining', {
                  defaultValue: 'Time remaining {{time}}',
                  time: formatDurationSeconds(position.remainingSeconds),
                })}
                className="text-xl font-semibold tabular-nums text-text-primary"
              >
                {formatDurationSeconds(position.remainingSeconds)}
              </Text>
            )}
          </View>
          {next && (
            <Text className="text-sm text-text-secondary">
              {t('workoutVideo.next', {
                defaultValue: 'Next: {{exercise}}',
                exercise: next.name,
              })}
            </Text>
          )}
        </>
      )}
    </View>
  );
}
