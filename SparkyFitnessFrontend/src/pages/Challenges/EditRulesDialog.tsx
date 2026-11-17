import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  challengeRulesEffectiveFrom,
  challengeRulesSchema,
  todayInZone,
  type ChallengeDetail,
  type ChallengeRules,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useChallengeUnits,
  useUpdateChallengeRules,
} from '@/hooks/Challenges/useChallenges';
import ChallengeRulesEditor from './ChallengeRulesEditor';

/**
 * The host changes the rules. Before the start a change applies from the
 * start; after it, from the next period, which the dialog says up front.
 */
const EditRulesDialog = ({
  challenge,
  open,
  onOpenChange,
}: {
  challenge: ChallengeDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();
  const units = useChallengeUnits();
  const update = useUpdateChallengeRules();
  // The host edits from their newest save, which may still be waiting for
  // the next period.
  const [rules, setRules] = useState<ChallengeRules>(
    challenge.pending_rules?.rules ?? challenge.rules
  );
  const today = todayInZone(challenge.time_zone);
  const started = today >= challenge.start_date;
  const effectiveFrom = challengeRulesEffectiveFrom(
    challenge.rules.period,
    today,
    challenge.start_date,
    challenge.end_date
  );
  const noPeriodLeft =
    challenge.end_date !== null && effectiveFrom > challenge.end_date;
  const valid = challengeRulesSchema.safeParse(rules).success;
  // The server refuses one whole-challenge period without an end date
  // (CHALLENGE_INVALID_DATES); say so before saving.
  const needsEnd = rules.period === 'challenge' && !challenge.end_date;
  const problem = needsEnd
    ? t(
        'challenges.create.endNeeded',
        'A challenge scored as one period needs an end date.'
      )
    : !valid
      ? t(
          'challenges.create.rulesInvalid',
          'A rule setting is empty or out of range.'
        )
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('challenges.rules.edit', 'Change the rules')}
          </DialogTitle>
          <DialogDescription>
            {noPeriodLeft
              ? t(
                  'challenges.rules.noPeriodLeft',
                  'No period is left for a change to apply to.'
                )
              : started
                ? t(
                    'challenges.rules.fromNext',
                    'The change counts from {{day}}, so the period under way keeps its rules. Every member sees it in the rule log.',
                    {
                      day: formatDateInUserTimezone(
                        effectiveFrom,
                        'EEE, MMM d'
                      ),
                    }
                  )
                : t(
                    'challenges.rules.beforeStart',
                    'The challenge has not started, so the change counts from the start.'
                  )}
          </DialogDescription>
        </DialogHeader>
        <ChallengeRulesEditor
          rules={rules}
          onChange={setRules}
          units={units}
          periodLocked={started}
          disabled={noPeriodLeft}
        />
        {problem && !noPeriodLeft && (
          <p className="text-sm text-muted-foreground" role="status">
            {problem}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            disabled={!!problem || noPeriodLeft || update.isPending}
            onClick={() =>
              update.mutate(
                { id: challenge.id, rules },
                { onSuccess: () => onOpenChange(false) }
              )
            }
          >
            {t('challenges.rules.save', 'Save rules')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditRulesDialog;
