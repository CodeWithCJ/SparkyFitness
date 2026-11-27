import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { AccordionContent, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  useCheckInNow,
  useResetTodayCheckin,
  useCoachesAvailable,
  useCoachSettings,
} from '@/hooks/Coaches/useCoaches';
import { useChatbotVisibility } from '@/contexts/ChatbotVisibilityContext';
import { useSetWebFeatureChoice } from '@/hooks/Settings/useFeatureChoices';
import { AboutMeCard } from './Coaches/AboutMeCard';
import { CoachKnowledgePanel } from './Coaches/CoachKnowledgePanel';
import { CoachList } from './Coaches/CoachList';
import { CoachScheduleCard } from './Coaches/CoachScheduleCard';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

/**
 * Settings > Wellness > Coaches (#2013): About me, check-in times, the daily
 * limit, a pause, and the coaches themselves. Owner-only; shown only while the
 * Coaches feature is on.
 */
export const CoachSettings = () => {
  const { t } = useTranslation();
  const available = useCoachesAvailable();
  const choice = useSetWebFeatureChoice();
  const { data, isLoading, isError, refetch } = useCoachSettings();
  const checkIn = useCheckInNow();
  const resetToday = useResetTodayCheckin();
  const { openChat } = useChatbotVisibility();

  return (
    <>
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'coaches.settings.description',
          'AI coaches that look at your data and speak up when it matters'
        )}
      >
        <Sparkles className="h-5 w-5" />
        {t('coaches.settings.title', 'Coaches')}
      </AccordionTrigger>
      <AccordionContent className="space-y-4 p-4 pt-0">
        {!available ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t(
                'coaches.settings.off',
                'Coaches are off. Turn them on to get short, timely messages from coaches that look at your food, training and sleep.'
              )}
            </p>
            <Button
              disabled={choice.state !== 'ready' || choice.isPending}
              onClick={() => choice.setFeatureOn('aiCoaches', true)}
            >
              {t('coaches.settings.turnOn', 'Turn on Coaches')}
            </Button>
          </div>
        ) : isLoading ? (
          <div
            className="h-24 animate-pulse rounded-md bg-muted/40"
            aria-hidden
          />
        ) : isError || !data ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              {t('coaches.settings.loadError', 'Could not load your coaches.')}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t('common.retry', 'Retry')}
            </Button>
          </div>
        ) : (
          <>
            <AboutMeCard
              // Remount with fresh values after a save elsewhere.
              key={JSON.stringify(data.profile)}
              profile={data.profile}
              allergens={data.allergens}
            />
            <CoachScheduleCard
              key={`${data.profile.checkin_times.join()}|${data.profile.paused_until}`}
              profile={data.profile}
            />
            <section className="space-y-2 rounded-lg border p-4">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold">
                  {t('coaches.checkInNow.title', 'Check in now')}
                </h3>
                <InfoTooltip
                  content={t(
                    'coaches.checkInNow.tooltip',
                    'Forces coaches to inspect your current live diary and evaluate rules right now, instead of waiting for your next scheduled check-in.'
                  )}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {data.last_checkin_at
                  ? t('coaches.checkInNow.last', 'Last check-in: {{when}}.', {
                      when: new Date(data.last_checkin_at).toLocaleString(),
                    })
                  : t(
                      'coaches.checkInNow.never',
                      'No check-in has run yet. They run at your check-in times.'
                    )}{' '}
                {t(
                  'coaches.checkInNow.where',
                  'Messages appear in the Sparky chat button, under the coach that wrote them.'
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  disabled={checkIn.isPending}
                  onClick={() => checkIn.mutate()}
                >
                  {t('coaches.checkInNow.button', 'Check in now')}
                </Button>
                <Button
                  variant="outline"
                  disabled={resetToday.isPending}
                  onClick={() => resetToday.mutate()}
                >
                  {t('coaches.checkInNow.resetToday', "Reset today's count")}
                </Button>
                <Button variant="ghost" onClick={() => openChat()}>
                  {t('coaches.checkInNow.openChat', 'Open chat')}
                </Button>
              </div>
              {checkIn.data && (
                <p className="text-sm" role="status">
                  {checkIn.data.sent > 0
                    ? t(
                        'coaches.checkInNow.sent',
                        '{{count}} new message. Open the chat to read it.',
                        { count: checkIn.data.sent }
                      )
                    : t(
                        `coaches.checkInNow.reason.${checkIn.data.reason ?? 'nothing_to_say'}`,
                        'Nothing to say right now.'
                      )}
                </p>
              )}
            </section>
            <CoachList coaches={data.coaches} />
            <CoachKnowledgePanel />
          </>
        )}
      </AccordionContent>
    </>
  );
};
