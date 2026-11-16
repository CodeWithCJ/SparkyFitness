import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useChallengeRuleChanges } from '@/hooks/Challenges/useChallenges';
import { changedRuleLines, type MetricUnits } from './challengeCopy';
import LoadError from './LoadError';

/**
 * Every rules change, newest first, with who made it and the day it takes
 * effect. Members all see this, so nobody can move the goalposts unseen.
 */
const RuleChangeLog = ({
  challengeId,
  units,
}: {
  challengeId: string;
  units: MetricUnits;
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, formatDate } = usePreferences();
  const changes = useChallengeRuleChanges(challengeId);

  if (changes.isLoading) return <Skeleton className="h-24 w-full" />;
  if (changes.isError && !changes.data) {
    return (
      <LoadError
        message={t(
          'challenges.errors.ruleChanges',
          'Could not load the rule changes.'
        )}
        onRetry={() => void changes.refetch()}
      />
    );
  }
  const list = [...(changes.data ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  if (!list.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('challenges.log.empty', 'No rule changes.')}
      </p>
    );
  }
  return (
    <ol className="space-y-3" data-testid="rule-change-log">
      {list.map((change) => {
        const lines = changedRuleLines(
          t,
          change.previous_rules,
          change.rules,
          units
        );
        return (
          <li key={change.id} className="rounded-md border p-3 text-sm">
            <p className="font-medium">
              {change.previous_rules
                ? t(
                    'challenges.log.changed',
                    '{{name}} changed the rules on {{when}}',
                    {
                      name:
                        change.changed_by_display_name ??
                        t('challenges.log.formerMember', 'A former member'),
                      when: formatDate(change.created_at),
                    }
                  )
                : t(
                    'challenges.log.created',
                    'Rules set when the challenge was made'
                  )}
            </p>
            <p className="text-muted-foreground">
              {t('challenges.log.effective', 'Counts from {{day}}', {
                day: formatDateInUserTimezone(
                  change.effective_from,
                  'MMM d, yyyy'
                ),
              })}
            </p>
            {lines.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
};

export default RuleChangeLog;
