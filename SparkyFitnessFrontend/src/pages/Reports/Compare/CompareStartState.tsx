import { useTranslation } from 'react-i18next';
import {
  SUGGESTED_QUESTIONS,
  type CompareQuestion,
  timingOf,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { sentenceText } from './compareCopy';
import { sinceSentence } from './compareSinceCopy';

interface CompareStartStateProps {
  recent: readonly CompareQuestion[];
  onPick: (question: CompareQuestion) => void;
}

// Recents are stored per browser and may come from any build, so only the
// five newest are shown.
const MAX_SHOWN_RECENT = 5;

export function CompareStartState({ recent, onPick }: CompareStartStateProps) {
  const { t } = useTranslation();

  const rows = (questions: readonly CompareQuestion[], prefix: string) =>
    questions.map((q) => (
      <Button
        key={`${prefix}-${q.a}-${q.b}-${q.choice}`}
        data-testid={`${prefix}-${q.a}-${q.b}-${q.choice}`}
        variant="outline"
        className="h-auto justify-start whitespace-normal py-3 text-left font-normal"
        onClick={() => onPick(q)}
      >
        {timingOf(q.choice).mode === 'since'
          ? sinceSentence(q, t)
          : sentenceText(q, t)}
      </Button>
    ));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {t('compareReport.start.suggestions', 'Try one of these')}
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {rows(SUGGESTED_QUESTIONS, 'compare-suggestion')}
        </div>
      </div>
      {recent.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {t('compareReport.start.recent', 'Your recent questions')}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {rows(recent.slice(0, MAX_SHOWN_RECENT), 'compare-recent')}
          </div>
        </div>
      )}
    </div>
  );
}
