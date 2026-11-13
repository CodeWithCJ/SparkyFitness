import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Info, TrendingUp } from 'lucide-react';
import type { AdaptiveReason } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import type { WorkoutPlaybackAdaptiveInfo } from '@/utils/workoutPlayback';

function adaptiveReasonText(t: TFunction, reason: AdaptiveReason): string {
  switch (reason) {
    case 'pain_reported':
      return t(
        'adaptiveCoaching.reasons.painReported',
        'Lighter today: you reported pain here last time.'
      );
    case 'pain_repeated':
      return t(
        'adaptiveCoaching.reasons.painRepeated',
        'Lighter today: pain here two sessions running. Consider an alternative.'
      );
    case 'session_pain':
      return t(
        'adaptiveCoaching.reasons.sessionPain',
        'Holding weight: you reported discomfort in your last workout.'
      );
    case 'too_hard':
      return t(
        'adaptiveCoaching.reasons.tooHard',
        'Holding weight: last time felt too hard.'
      );
    case 'too_hard_repeated':
      return t(
        'adaptiveCoaching.reasons.tooHardRepeated',
        'Lighter today: too hard two sessions running.'
      );
    case 'high_effort':
      return t(
        'adaptiveCoaching.reasons.highEffort',
        'Holding weight: your last sets were near max effort.'
      );
    case 'low_effort':
      return t(
        'adaptiveCoaching.reasons.lowEffort',
        'A step heavier: your last sets were logged as easy.'
      );
    case 'too_easy_repeated':
      return t(
        'adaptiveCoaching.reasons.tooEasyRepeated',
        'A step heavier: too easy two sessions running.'
      );
  }
}

interface AdaptiveSuggestionNoticeProps {
  adaptive: WorkoutPlaybackAdaptiveInfo | null;
  suggestVariation: boolean;
  onDeclinedChange?: (declined: boolean) => void;
  onSeeAlternatives?: () => void;
}

/**
 * Why today's prescribed sets differ from the usual suggestion (#1560),
 * with a one-click way back. An unexplained weight change reads as a bug,
 * so an adjustment is never applied without this.
 */
const AdaptiveSuggestionNotice = ({
  adaptive,
  suggestVariation,
  onDeclinedChange,
  onSeeAlternatives,
}: AdaptiveSuggestionNoticeProps) => {
  const { t } = useTranslation();
  const declined = adaptive?.declined ?? false;

  let message: string;
  if (adaptive && !declined) {
    message = adaptiveReasonText(t, adaptive.reason);
  } else if (adaptive && declined) {
    message = t('adaptiveCoaching.declined', 'Using your usual suggestion.');
  } else {
    message = t(
      'adaptiveCoaching.variation',
      "You've done this in most recent workouts. Try a variation?"
    );
  }
  const showAlternatives =
    onSeeAlternatives != null &&
    ((adaptive?.suggest_alternative === true && !declined) || suggestVariation);
  const Icon = adaptive?.kind === 'increase' ? TrendingUp : Info;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs"
      data-testid="adaptive-suggestion-notice"
      role="status"
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span>{message}</span>
      </span>
      {adaptive && onDeclinedChange && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => onDeclinedChange(!declined)}
        >
          {declined
            ? t('adaptiveCoaching.useAdjusted', 'Use the adjusted suggestion')
            : t('adaptiveCoaching.useUsual', 'Use my usual')}
        </Button>
      )}
      {showAlternatives && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={onSeeAlternatives}
        >
          {t('adaptiveCoaching.seeAlternatives', 'See alternatives')}
        </Button>
      )}
    </div>
  );
};

export default AdaptiveSuggestionNotice;
