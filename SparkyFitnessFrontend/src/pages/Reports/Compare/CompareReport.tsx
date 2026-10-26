import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  clampSinceStart,
  compareWindow,
  DEFAULT_COMPARE_SPAN,
  isAskable,
  timingOf,
  todayInZone,
  type CompareMetricKey,
  type CompareMode,
  type CompareQuestion,
  type CompareSinceResponse,
  type CompareSpan,
  type CompareSpanMode,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  useCompareQuestion,
  useCompareSinceQuestion,
} from '@/hooks/Reports/useCompare';
import { useAuth } from '@/hooks/useAuth';
import { CompareAnswerCard } from './CompareAnswerCard';
import { CompareChecks } from './CompareChecks';
import { CompareDaysTable } from './CompareDaysTable';
import { CompareDotsChart } from './CompareDotsChart';
import { CompareHowSure } from './CompareHowSure';
import { CompareOverTimeChart } from './CompareOverTimeChart';
import { CompareSentence } from './CompareSentence';
import { CompareSinceAnswer } from './CompareSinceAnswer';
import { CompareSinceChart } from './CompareSinceChart';
import { CompareSinceControls } from './CompareSinceControls';
import { CompareSinceMonthTable } from './CompareSinceMonthTable';
import { CompareSpanControl } from './CompareSpanControl';
import { CompareStartState } from './CompareStartState';
import { CompareTimingTable } from './CompareTimingTable';
import { howSureLines } from './compareCopy';
import type { CustomRange } from './compareCustomRange';
import { loadRecentQuestions, saveRecentQuestion } from './compareRecents';
import { timingRows } from './compareTables';

// A question with no timing picked yet is read as a day question.
const modeOf = (question: Partial<CompareQuestion>): CompareMode =>
  question.choice ? timingOf(question.choice).mode : 'day';

export const CompareReport = () => {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const { isActingOnBehalf } = useActiveUser();
  // The same id the queries are keyed by; recents are kept per account.
  const userId = useAuth().user?.activeUserId;
  const [question, setQuestion] = useState<Partial<CompareQuestion>>({});
  const [span, setSpan] = useState<CompareSpan>(DEFAULT_COMPARE_SPAN.day);
  const [custom, setCustom] = useState<CustomRange | null>(null);
  // The mode the span and custom range were picked for. Since mode has no
  // span, so it keeps the day or week one for the way back.
  const [spanMode, setSpanMode] = useState<CompareSpanMode>('day');
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
  const savedKey = useRef<string | null>(null);

  const mode = modeOf(question);
  const isSince = mode === 'since';
  const today = todayInZone(timezone);

  // A span valid by day (30 days) is not valid by week, so a change between
  // day and week starts over; a trip through since mode keeps it.
  const applyQuestion = (next: Partial<CompareQuestion>) => {
    const nextMode = modeOf(next);
    if (nextMode !== 'since' && nextMode !== spanMode) {
      setSpanMode(nextMode);
      setSpan(DEFAULT_COMPARE_SPAN[nextMode]);
      setCustom(null);
    }
    setQuestion(next);
  };

  const { answer, timings } = useCompareQuestion(
    question,
    isActingOnBehalf ? null : compareWindow(span, spanMode, today, custom)
  );

  const habitStart =
    startPick && startPick.a === question.a
      ? clampSinceStart(startPick.day, today)
      : null;
  const line = linePick && linePick.b === question.b ? linePick.line : null;
  const since = useCompareSinceQuestion(
    question,
    isActingOnBehalf ? null : { habitStart, line }
  );

  // The controls keep the last answer for this pair while a new start or line
  // loads, so the suggested start and the line do not flicker away.
  const [lastSince, setLastSince] = useState<CompareSinceResponse>();
  if (since.data && since.data !== lastSince) setLastSince(since.data);
  const keptSince =
    lastSince &&
    lastSince.habit.key === question.a &&
    lastSince.outcome.key === question.b
      ? lastSince
      : undefined;

  const askable = isAskable(question) ? question : null;
  const response = answer.data;
  const sinceResponse = since.data;
  // Whichever query the current mode asks, for loading and error.
  const active = isSince ? since : answer;
  useEffect(() => {
    if (!askable || !(isSince ? sinceResponse : response)) return;
    const key = `${askable.a}|${askable.b}|${askable.choice}`;
    if (savedKey.current === key) return;
    savedKey.current = key;
    saveRecentQuestion(userId, askable);
  }, [askable, isSince, response, sinceResponse, userId]);

  if (isActingOnBehalf) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('compareReport.onlyYourOwnData', 'Compare shows only your own data')}
      </p>
    );
  }

  const rows =
    askable && !isSince
      ? timingRows(askable, [
          {
            timing: timingOf(askable.choice).timing,
            data: answer.data,
            isLoading: answer.isLoading,
            isError: answer.isError,
          },
          ...timings.map(({ timing, query: result }) => ({
            timing,
            data: result.data,
            isLoading: result.isLoading,
            isError: result.isError,
          })),
        ])
      : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <CompareSentence question={question} onChange={applyQuestion} />
        {askable && isSince && (
          <CompareSinceControls
            response={keptSince}
            outcome={askable.b}
            today={today}
            habitStart={habitStart}
            line={line}
            onStartChange={(day) => setStartPick({ a: askable.a, day })}
            onLineChange={(value) => setLinePick({ b: askable.b, line: value })}
          />
        )}
        {askable && !isSince && (
          <CompareSpanControl
            mode={mode}
            span={span}
            custom={custom}
            today={today}
            onChange={(nextSpan, nextCustom) => {
              setSpan(nextSpan);
              setCustom(nextCustom);
            }}
          />
        )}
      </div>

      {!askable && (
        <CompareStartState
          recent={loadRecentQuestions(userId)}
          onPick={(picked) => applyQuestion(picked)}
        />
      )}

      {askable && active.isLoading && (
        <div>{t('compareReport.loading', 'Loading comparison...')}</div>
      )}
      {/* A failed background refresh keeps the answer already on screen. */}
      {askable && active.isError && !active.data && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-destructive">
            {t('compareReport.loadFailed', "Couldn't load this comparison")}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={active.isFetching}
            onClick={() => void active.refetch()}
          >
            {t('compareReport.screen.retry', 'Retry')}
          </Button>
        </div>
      )}

      {askable && isSince && sinceResponse && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <CompareSinceAnswer response={sinceResponse} />
            <CompareSinceChart response={sinceResponse} />
          </div>
          {sinceResponse.result.status === 'ok' && (
            <CompareSinceMonthTable response={sinceResponse} />
          )}
        </>
      )}

      {askable && !isSince && response && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <CompareAnswerCard
                response={response}
                question={askable}
                span={span}
              />
              <CompareHowSure
                lines={howSureLines(response.result, askable, t)}
              />
              <CompareChecks response={response} question={askable} />
            </div>
            <div className="space-y-6">
              <CompareDotsChart response={response} question={askable} />
              <CompareOverTimeChart response={response} question={askable} />
            </div>
          </div>
          <CompareTimingTable
            question={askable}
            rows={rows}
            onPickTiming={(choice) => applyQuestion({ ...askable, choice })}
          />
          <CompareDaysTable response={response} question={askable} />
        </>
      )}
    </div>
  );
};
