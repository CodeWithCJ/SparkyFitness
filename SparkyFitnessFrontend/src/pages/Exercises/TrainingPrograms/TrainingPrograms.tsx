import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  restartBody,
  scheduleBody,
  setEnabledBody,
  setPositionBody,
  skipWorkoutBody,
  startProgramBody,
  todayInZone,
  toggleDayBody,
} from '@workspace/shared';
import { ArrowLeft } from 'lucide-react';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useCompleteRunProgramWorkoutMutation,
  useCustomRunPrograms,
  useRunProgram,
  useSaveRunProgramMutation,
} from '@/hooks/Exercises/useRunProgram';

import StartProgramDialog from './StartProgramDialog';
import TrainingProgramCalendar from './TrainingProgramCalendar';
import TrainingProgramCard from './TrainingProgramCard';
import TrainingProgramPicker from './TrainingProgramPicker';

interface PendingStart {
  id: string;
  name: string;
}

/**
 * Training programs: browse the built-in run and walk programs, start one, and
 * follow it. The program is personal, so it is not offered while acting on
 * behalf of someone else.
 */
const TrainingPrograms = () => {
  const { t } = useTranslation();
  const { isActingOnBehalf } = useActiveUser();
  const { timezone } = usePreferences();
  const own = !isActingOnBehalf;
  const { program, status, isLoading } = useRunProgram(own);
  const { programs: customPrograms } = useCustomRunPrograms(own);
  const save = useSaveRunProgramMutation();
  const complete = useCompleteRunProgramWorkoutMutation();
  const [now] = useState(() => Date.now());
  const today = todayInZone(timezone);
  const busy = save.isPending || complete.isPending;

  const [startAsking, setStartAsking] = useState<PendingStart | null>(null);
  const [switchAsking, setSwitchAsking] = useState<PendingStart | null>(null);

  // Switching a held program, running or paused, starts the new one from
  // week 1 (and switches it on), so it is always confirmed first.
  const chooseProgram = (id: string, name: string) => {
    if (program && program.program_id !== id) {
      setSwitchAsking({ id, name });
    } else {
      setStartAsking({ id, name });
    }
  };

  const heading = (
    <div className="flex items-center gap-3">
      <Link
        to="/exercises"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('trainingPrograms.page.back', 'Exercises')}
      </Link>
    </div>
  );

  if (!own) {
    return (
      <div className="space-y-4">
        {heading}
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {t(
              'trainingPrograms.page.ownOnly',
              'Training programs are personal. Switch back to your own account to see yours.'
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {heading}
      <div>
        <h1 className="text-2xl font-bold">
          {t('trainingPrograms.page.title', 'Training programs')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'trainingPrograms.page.intro',
            'Follow a plan that builds up week by week. Pick a program to see what it involves, then start it when you are ready.'
          )}
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {program && status ? (
            <>
              <TrainingProgramCard
                program={program}
                status={status}
                today={today}
                now={now}
                busy={busy}
                onToggleEnabled={(enabled) =>
                  save.mutate(setEnabledBody(program, enabled))
                }
                onMarkDone={() =>
                  complete.mutate({
                    index: program.next_index,
                    program_id: program.program_id,
                    day: today,
                  })
                }
                onSkip={() => save.mutate(skipWorkoutBody(program))}
                onRestart={() => save.mutate(restartBody(program))}
                onPickWorkout={(index) =>
                  save.mutate(setPositionBody(program, index))
                }
                onToggleDay={(day) =>
                  save.mutate((current) =>
                    current ? toggleDayBody(current, day) : null
                  )
                }
                onStartDay={(startDay) =>
                  save.mutate(scheduleBody(program, { startDay }))
                }
                onEndDay={(endDay) =>
                  save.mutate(scheduleBody(program, { endDay }))
                }
              />
              <TrainingProgramCalendar
                program={program}
                status={status}
                today={today}
                busy={busy}
                onCatchUp={(next) =>
                  save.mutate(setPositionBody(program, next))
                }
              />
              <h2 className="pt-2 text-lg font-semibold">
                {t('trainingPrograms.page.allPrograms', 'All programs')}
              </h2>
            </>
          ) : null}
          <TrainingProgramPicker
            storedProgramId={program?.program_id ?? null}
            customPrograms={customPrograms}
            busy={busy}
            onStart={chooseProgram}
          />
        </>
      )}

      <StartProgramDialog
        open={startAsking !== null}
        onOpenChange={(open) => {
          if (!open) setStartAsking(null);
        }}
        programName={startAsking?.name ?? ''}
        today={today}
        onStart={(startDay) => {
          if (startAsking) {
            save.mutate(startProgramBody(startAsking.id, startDay));
          }
          setStartAsking(null);
        }}
      />
      <ConfirmationDialog
        open={switchAsking !== null}
        onOpenChange={(open) => {
          if (!open) setSwitchAsking(null);
        }}
        title={t('trainingPrograms.switch.title', 'Switch to {{name}}?', {
          name: switchAsking?.name ?? '',
        })}
        description={t(
          'trainingPrograms.switch.message',
          'You will start the new program at week 1. Your place in the current one is not kept.'
        )}
        confirmLabel={t('trainingPrograms.switch.confirm', 'Switch')}
        onConfirm={() => {
          // The schedule (run days, first and goal day) is kept.
          if (switchAsking) save.mutate(startProgramBody(switchAsking.id));
          setSwitchAsking(null);
        }}
      />
    </div>
  );
};

export default TrainingPrograms;
