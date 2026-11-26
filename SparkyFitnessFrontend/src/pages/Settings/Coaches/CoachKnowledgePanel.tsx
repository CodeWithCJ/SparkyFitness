import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useCoachKnowledge,
  useCoachSettings,
  useUpdateBuiltinCoach,
  useUpdateCustomCoach,
} from '@/hooks/Coaches/useCoaches';
import { CHAT_TOOL_CATEGORY_LABELS } from '@/constants/chatToolCategoryLabels';
import { isChatToolCategorySlug } from '@workspace/shared';
import { coachName, ruleTitle } from '@/utils/coachLabels';

/** "What my coaches know": About me, the pause, what each coach can look at,
 * and any topic a coach stopped bringing up after thumbs-down. */
export function CoachKnowledgePanel() {
  const { t } = useTranslation();
  const { data: knowledge } = useCoachKnowledge();
  const { data: settings } = useCoachSettings();
  const updateBuiltin = useUpdateBuiltinCoach();
  const updateCustom = useUpdateCustomCoach();
  if (!knowledge) return null;

  const { profile } = knowledge;
  const facts = [
    profile.diet_type &&
      t(`coaches.diets.${profile.diet_type}`, profile.diet_type),
    profile.foods_avoid &&
      t('coaches.knowledge.avoids', 'Avoids: {{foods}}', {
        foods: profile.foods_avoid,
      }),
    profile.foods_prefer &&
      t('coaches.knowledge.likes', 'Likes: {{foods}}', {
        foods: profile.foods_prefer,
      }),
    knowledge.allergens.length > 0 &&
      t('coaches.knowledge.allergies', 'Allergies: {{list}}', {
        list: knowledge.allergens.join(', '),
      }),
    profile.tone && t(`coaches.tones.${profile.tone}`, profile.tone),
  ].filter(
    (fact): fact is string => typeof fact === 'string' && fact.length > 0
  );

  const turnBackOn = (
    coachKey: string | null,
    coachId: string | null,
    ruleId: string
  ) => {
    const coach = settings?.coaches.find((item) =>
      coachKey ? item.builtin_key === coachKey : item.id === coachId
    );
    if (!coach) return;
    const rules = coach.rules.rules.map((rule) => ({
      id: rule.id,
      enabled: rule.id === ruleId ? true : rule.enabled,
      conditions: rule.conditions,
    }));
    if (coachKey) {
      updateBuiltin.mutate({ key: coachKey, body: { rules } });
    } else if (coachId) {
      updateCustom.mutate({
        id: coachId,
        body: {
          rules: {
            version: 1,
            rules: coach.rules.rules.map((rule) =>
              rule.id === ruleId ? { ...rule, enabled: true } : rule
            ),
          },
        },
      });
    }
  };

  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      data-testid="coach-knowledge"
    >
      <div>
        <h3 className="text-sm font-semibold">
          {t('coaches.knowledge.title', 'What my coaches know')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {facts.length > 0
            ? facts.join(' · ')
            : t('coaches.knowledge.nothing', 'Nothing saved in About me yet.')}
        </p>
        {knowledge.pause && (
          <p className="text-sm">
            {t('coaches.pause.until', 'Paused until {{date}}.', {
              date: knowledge.pause.until,
            })}
          </p>
        )}
      </div>
      {knowledge.coaches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('coaches.knowledge.noCoaches', 'No coach is switched on.')}
        </p>
      ) : (
        <ul className="space-y-3">
          {knowledge.coaches.map((coach) => (
            <li key={coach.id ?? coach.builtin_key} className="space-y-1.5">
              <p className="text-sm font-medium">
                {coachName(t, coach.builtin_key, coach.name)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {coach.tool_categories
                  .filter(isChatToolCategorySlug)
                  .map((slug) => {
                    const [key, fallback] = CHAT_TOOL_CATEGORY_LABELS[slug];
                    return (
                      <Badge key={slug} variant="secondary">
                        {t(key, fallback)}
                      </Badge>
                    );
                  })}
              </div>
              {coach.muted_rules.map((ruleId) => (
                <div
                  key={ruleId}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="text-muted-foreground">
                    {t(
                      'coaches.knowledge.muted',
                      'Stopped mentioning: {{rule}}',
                      {
                        rule: ruleTitle(t, coach.builtin_key, ruleId),
                      }
                    )}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={updateBuiltin.isPending || updateCustom.isPending}
                    onClick={() =>
                      turnBackOn(coach.builtin_key, coach.id, ruleId)
                    }
                  >
                    {t('coaches.knowledge.unmute', 'Turn back on')}
                  </Button>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
