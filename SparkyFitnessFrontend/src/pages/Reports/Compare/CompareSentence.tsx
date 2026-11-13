import { useTranslation } from 'react-i18next';
import {
  COMPARE_METRIC_KEYS,
  COMPARE_METRICS,
  type CompareMetricDef,
  type CompareMetricKey,
  type CompareMode,
  type CompareQuestion,
  type CompareTimingChoice,
  isAskable,
  offeredInMode,
  questionForMode,
  timingOf,
} from '@workspace/shared';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { metricName, questionParts } from './compareCopy';
import {
  COMPARE_GROUP_LABELS,
  COMPARE_METRIC_LABELS,
} from './compareMetricLabels';

interface CompareSentenceProps {
  question: Partial<CompareQuestion>;
  onChange: (question: Partial<CompareQuestion>) => void;
}

type Slot = 'a' | 'b';

const GROUP_ORDER: readonly CompareMetricDef['group'][] = [
  'feelings',
  'sleep',
  'meditation',
  'food',
  'training',
  'body',
];

export function CompareSentence({ question, onChange }: CompareSentenceProps) {
  const { t } = useTranslation();
  const mode: CompareMode = question.choice
    ? timingOf(question.choice).mode
    : 'day';
  const parts = questionParts(question, t);

  const chooseMetric = (slot: Slot, key: CompareMetricKey) => {
    const other: Slot = slot === 'a' ? 'b' : 'a';
    // Picking the other side's metric swaps the two rather than blocking.
    if (question[other] === key) {
      onChange({ ...question, [slot]: key, [other]: question[slot] });
    } else {
      onChange({ ...question, [slot]: key });
    }
  };

  const chooseTiming = (choice: CompareTimingChoice) => {
    onChange(questionForMode({ ...question, choice }, timingOf(choice).mode));
  };

  const words = (text: string) => (
    <span className="text-lg text-foreground">{text}</span>
  );

  const metricPicker = (slot: Slot) => {
    const key = question[slot];
    const exclude = question[slot === 'a' ? 'b' : 'a'];
    const title =
      slot === 'a'
        ? t('compareReport.sentence.firstTitle', 'First thing')
        : t('compareReport.sentence.secondTitle', 'Second thing');
    const label =
      parts[slot] ?? t('compareReport.sentence.something', 'something');
    return (
      <Select
        value={key ?? ''}
        onValueChange={(value) => chooseMetric(slot, value as CompareMetricKey)}
      >
        <SelectTrigger
          aria-label={`${title}: ${label}`}
          className={`h-9 w-auto gap-2 text-lg font-semibold ${
            key ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {GROUP_ORDER.map((group) => {
            const keys = COMPARE_METRIC_KEYS.filter((k) => {
              const def = COMPARE_METRICS[k];
              return (
                def.group === group && k !== exclude && offeredInMode(k, mode)
              );
            });
            if (keys.length === 0) return null;
            return (
              <SelectGroup key={group}>
                <SelectLabel>{COMPARE_GROUP_LABELS[group](t)}</SelectLabel>
                {keys.map((k) => (
                  <SelectItem key={k} value={k}>
                    {COMPARE_METRIC_LABELS[k](t)}
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    );
  };

  const timingTitle = t('compareReport.sentence.timingTitle', 'When');
  const timingLabel =
    parts.timing ?? t('compareReport.sentence.sometime', 'some time');
  const timingPicker = (
    <Select
      value={question.choice ?? ''}
      onValueChange={(value) => chooseTiming(value as CompareTimingChoice)}
    >
      <SelectTrigger
        aria-label={`${timingTitle}: ${timingLabel}`}
        className={`h-9 w-auto gap-2 text-lg font-semibold ${
          question.choice ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <SelectValue>{timingLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>
            {t('compareReport.sentence.dayByDay', 'Day by day')}
          </SelectLabel>
          <SelectItem value="sameDay">
            {t('compareReport.sentence.sameDay', 'The same day')}
          </SelectItem>
          <SelectItem value="nextDay">
            {t('compareReport.sentence.nextDay', 'The next day')}
          </SelectItem>
          <SelectItem value="dayBefore">
            {t('compareReport.sentence.dayBefore', 'The day before')}
          </SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>
            {t('compareReport.sentence.weekByWeek', 'Week by week')}
          </SelectLabel>
          <SelectItem value="sameWeek">
            {t('compareReport.sentence.sameWeek', 'The same week')}
          </SelectItem>
          <SelectItem value="nextWeek">
            {t('compareReport.sentence.nextWeek', 'The next week')}
          </SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>
            {t('compareReport.sentence.sinceHabit', 'Since a habit started')}
          </SelectLabel>
          <SelectItem value="sinceHabit">
            {t('compareReport.sentence.beforeVsSince', 'Before vs. since')}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );

  // A weekly question needs both metrics to have a weekly form.
  const dayOnly =
    question.choice &&
    mode === 'week' &&
    !isAskable(question) &&
    [question.a, question.b].find(
      (key) => key && COMPARE_METRICS[key].weekly === null
    );

  return (
    <div className="space-y-2">
      {mode === 'since' ? (
        // "Since I started [X] regularly, has [Y] changed?" The "Since" is the
        // timing picker, so the person can switch back to day or week.
        <div className="flex flex-wrap items-center gap-2">
          {timingPicker}
          {words(t('compareReport.sentence.iStarted', 'I started'))}
          {metricPicker('a')}
          {words(t('compareReport.sentence.regularlyHas', 'regularly, has'))}
          {metricPicker('b')}
          {words(t('compareReport.sentence.changed', 'changed?'))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {words(t('compareReport.sentence.does', 'Does'))}
          {metricPicker('a')}
          {words(t('compareReport.sentence.goWith', 'go with'))}
          {metricPicker('b')}
          {timingPicker}
          {words(t('compareReport.sentence.questionMark', '?'))}
        </div>
      )}
      {dayOnly && (
        <p className="text-sm text-muted-foreground">
          {t('compareReport.dayOnly', {
            defaultValue: '{{metric}} can only be compared by day',
            metric: metricName(dayOnly, t),
          })}
        </p>
      )}
    </div>
  );
}
