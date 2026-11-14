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
  const [rules, setRules] = useState<ChallengeRules>(challenge.rules);
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            disabled={!valid || noPeriodLeft || update.isPending}
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
