import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import {
  clampSinceStart,
  type CompareMetricKey,
  type CompareMode,
  type CompareQuestion,
  type CompareSinceResponse,
  type CompareSpan,
  compareWindow,
  DEFAULT_COMPARE_SPAN,
  isAskable,
  knownCompareQuestions,
  type CompareSpanMode,
  timingOf,
} from '@workspace/shared';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useCompare, useCompareSince } from '../hooks/useCompare';
import { useTodayOnFocus } from '../hooks/useTodayOnFocus';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import CompareSentence from '../components/compare/CompareSentence';
import CompareSpanControl from '../components/compare/CompareSpanControl';
import CompareStartState from '../components/compare/CompareStartState';
import CompareAnswerCard from '../components/compare/CompareAnswerCard';
import CompareChart from '../components/compare/CompareChart';
import CompareChecksCard from '../components/compare/CompareChecksCard';
import CompareSinceRows from '../components/compare/CompareSinceRows';
import CompareSinceCard from '../components/compare/CompareSinceCard';
import CompareSinceChart from '../components/compare/CompareSinceChart';
import type { CustomRange } from '../utils/trendRange';
import type { RootStackScreenProps } from '../types/navigation';

type CompareReportScreenProps = RootStackScreenProps<'CompareReport'>;

/** What both answer hooks report, for the shared loading, error and too-old states. */
interface AnswerState {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  serverTooOld: boolean;
  refetch: () => void;
}

const questionKey = (q: CompareQuestion) => `${q.a}|${q.b}|${q.choice}`;

const CompareReportScreen: React.FC<CompareReportScreenProps> = () => {
  const { t } = useTranslation();
  const accent = useCSSVariable('--color-accent-primary') as string;
  const header = useScreenHeader({
    title: t('compareReport.title', { defaultValue: 'Compare' }),
    left: { kind: 'back' },
  });

  const [question, setQuestion] = useState<Partial<CompareQuestion>>({});
  // Each mode remembers its own span, so flipping day/week/day keeps the pick.
  const [spans, setSpans] =
    useState<Record<CompareSpanMode, CompareSpan>>(DEFAULT_COMPARE_SPAN);
  const [customs, setCustoms] = useState<
    Record<CompareSpanMode, CustomRange | null>
  >({
    day: null,
    week: null,
  });
  // A since start belongs to its habit and a line to its outcome's scale, so
  // each is set aside while a different metric is picked in that slot.
  const [startPick, setStartPick] = useState<{
    a: CompareMetricKey;
    day: string;
  } | null>(null);
  const [linePick, setLinePick] = useState<{
    b: CompareMetricKey;
    line: number;
  } | null>(null);
  const today = useTodayOnFocus();

  const mode: CompareMode = question.choice
    ? timingOf(question.choice).mode
    : 'day';
  // Since mode has no span; the day one is kept for the way back.
  const spanMode: CompareSpanMode = mode === 'since' ? 'day' : mode;
  const span = spans[spanMode];
  const window = compareWindow(span, spanMode, today, customs[spanMode]);
  const habitStart =
    startPick && startPick.a === question.a
      ? clampSinceStart(startPick.day, today)
      : null;
  const line = linePick && linePick.b === question.b ? linePick.line : null;

  const storedRecent = useAppPreferencesStore((s) => s.compareRecentQuestions);
  const recent = useMemo(
    () => knownCompareQuestions(storedRecent),
    [storedRecent]
  );
  const addRecent = useAppPreferencesStore((s) => s.addCompareRecentQuestion);

  const paired = useCompare(question, window);
  const since = useCompareSince(question, habitStart, line);

  // The since rows keep the last answer for this pair while a new start or
  // line loads, so the suggested start and the line do not flicker away.
  const [lastSince, setLastSince] = useState<CompareSinceResponse>();
  if (since.data && since.data !== lastSince) setLastSince(since.data);
  const rowsAnswer =
    lastSince &&
    lastSince.habit.key === question.a &&
    lastSince.outcome.key === question.b
      ? lastSince
      : undefined;

  const answered = mode === 'since' ? since.data : paired.data;
  const askable = isAskable(question);
  const lastRecorded = useRef<string | null>(null);
  useEffect(() => {
    if (!answered || !isAskable(question)) return;
    const key = questionKey(question);
    if (lastRecorded.current === key) return;
    lastRecorded.current = key;
    addRecent(question);
  }, [answered, question, addRecent]);

  const notice = (text: string, action?: React.ReactNode) => (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm items-center">
      <Text className="text-text-secondary text-sm text-center">{text}</Text>
      {action}
    </View>
  );

  /** Too old, failed or still loading; null once there is an answer to show. */
  const renderState = (state: AnswerState) => {
    if (state.serverTooOld) {
      return notice(
        t('compareReport.screen.tooOld', {
          defaultValue:
            'Compare needs a newer SparkyFitness server. Update your server to use it.',
        })
      );
    }
    // A failed background refresh keeps the answer already on screen.
    if (state.isError && !state.data) {
      return notice(
        t('compareReport.screen.loadFailed', {
          defaultValue: "Couldn't load this comparison.",
        }),
        <TouchableOpacity
          onPress={state.refetch}
          accessibilityRole="button"
          className="mt-3 px-4 py-2 rounded-lg bg-raised"
        >
          <Text className="text-accent-primary text-sm font-semibold">
            {t('compareReport.screen.retry', { defaultValue: 'Retry' })}
          </Text>
        </TouchableOpacity>
      );
    }
    if (state.isLoading || !state.data) {
      return (
        <View className="py-8 items-center" testID="compare-loading">
          <ActivityIndicator color={accent} />
        </View>
      );
    }
    return null;
  };

  const renderAnswer = (q: CompareQuestion) => {
    const state = renderState(paired);
    if (state || !paired.data) return state;
    return (
      <>
        <CompareAnswerCard response={paired.data} question={q} span={span} />
        <CompareChart response={paired.data} question={q} />
        <CompareChecksCard
          result={paired.data.result}
          question={q}
          mode={mode}
        />
      </>
    );
  };

  const renderSinceAnswer = () => {
    const state = renderState(since);
    if (state || !since.data) return state;
    return (
      <>
        <CompareSinceCard response={since.data} />
        <CompareSinceChart response={since.data} />
      </>
    );
  };

  const renderSince = (q: CompareQuestion) => (
    <>
      <View className="mt-3">
        <CompareSinceRows
          response={rowsAnswer}
          outcome={q.b}
          today={today}
          habitStart={habitStart}
          line={line}
          onStartChange={(day) => setStartPick({ a: q.a, day })}
          onLineChange={(value) => setLinePick({ b: q.b, line: value })}
        />
      </View>
      {renderSinceAnswer()}
    </>
  );

  return (
    <ReportScreenLayout header={header}>
      <CompareSentence question={question} onChange={setQuestion} />
      {mode === 'since' ? null : (
        <View className="mt-3">
          <CompareSpanControl
            mode={spanMode}
            span={span}
            custom={customs[spanMode]}
            onSpanChange={(next) =>
              setSpans((current) => ({ ...current, [spanMode]: next }))
            }
            onCustomChange={(range) =>
              setCustoms((current) => ({ ...current, [spanMode]: range }))
            }
          />
        </View>
      )}
      {askable ? (
        mode === 'since' ? (
          renderSince(question)
        ) : (
          renderAnswer(question)
        )
      ) : (
        <View className="mt-4">
          <CompareStartState recent={recent} onPick={setQuestion} />
        </View>
      )}
    </ReportScreenLayout>
  );
};

export default CompareReportScreen;
