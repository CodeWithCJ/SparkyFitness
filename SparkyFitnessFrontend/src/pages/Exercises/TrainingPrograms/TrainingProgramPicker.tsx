import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  customProgramId,
  findProgram,
  PICKER_PROGRAMS,
  programOutline,
  programVersions,
  type CustomRunProgramResponse,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  programDescription,
  programName,
  programStructure,
} from '@/utils/runPrograms';

interface TrainingProgramPickerProps {
  /** The program the person holds now (running or paused), if any. */
  storedProgramId: string | null;
  customPrograms: readonly CustomRunProgramResponse[];
  busy: boolean;
  onStart: (programId: string, name: string) => void;
}

/** The built-in programs (with the 3 or 4 runs a week choice) and the person's own plans. */
const TrainingProgramPicker = ({
  storedProgramId,
  customPrograms,
  busy,
  onStart,
}: TrainingProgramPickerProps) => {
  const { t } = useTranslation();
  // Which version (3 or 4 runs a week) is picked on a card that has both.
  const [versionOf, setVersionOf] = useState<Record<string, string>>({});

  return (
    <div className="space-y-4" data-testid="training-program-picker">
      {PICKER_PROGRAMS.map((basic) => {
        const versions = programVersions(basic.id);
        const program =
          versions.find((v) => v.id === versionOf[basic.id]) ?? basic;
        const full = findProgram(program.id);
        const outline = full ? programOutline(full) : null;
        const isCurrent = storedProgramId === program.id;
        return (
          <Card key={basic.id} data-testid={`training-program-${basic.id}`}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">
                  {programName(t, basic.id)}
                </CardTitle>
                {isCurrent ? (
                  <Badge variant="secondary">
                    {t('trainingPrograms.picker.current', 'Current program')}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  'trainingPrograms.picker.weeksRuns',
                  '{{weeks}} weeks, {{runs}} workouts a week',
                  { weeks: program.weeks, runs: program.workoutsPerWeek }
                )}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {versions.length > 1 ? (
                <div
                  className="space-y-1"
                  data-testid={`training-versions-${basic.id}`}
                >
                  <div className="flex flex-wrap gap-2">
                    {versions.map((v) => (
                      <Button
                        key={v.id}
                        type="button"
                        size="sm"
                        variant={v.id === program.id ? 'default' : 'outline'}
                        aria-pressed={v.id === program.id}
                        onClick={() =>
                          setVersionOf((prev) => ({
                            ...prev,
                            [basic.id]: v.id,
                          }))
                        }
                      >
                        {t(
                          'trainingPrograms.picker.runsPerWeekOption',
                          '{{count}} runs a week',
                          {
                            count: v.workoutsPerWeek,
                            defaultValue_one: '{{count}} run a week',
                            defaultValue_other: '{{count}} runs a week',
                          }
                        )}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'trainingPrograms.picker.runsPerWeekHint',
                      'A fourth run adds a short easy run, so the long run is a smaller share of your week.'
                    )}
                  </p>
                </div>
              ) : null}
              <p className="text-sm">{programDescription(t, program.id)}</p>
              <p className="text-sm text-muted-foreground">
                {programStructure(t, program.id)}
              </p>
              {outline ? (
                <p className="text-xs text-muted-foreground">
                  {program.activity === 'walk'
                    ? t(
                        'trainingPrograms.picker.outlineWalk',
                        'Week 1: workouts of {{weekOne}} minutes. Builds to {{peak}} minutes of brisk walking.',
                        {
                          weekOne: outline.firstWeek.join(', '),
                          peak: outline.peakRunMinutes,
                        }
                      )
                    : t(
                        'trainingPrograms.picker.outline',
                        'Week 1: workouts of {{weekOne}} minutes. Builds to {{peak}} minutes of effort.',
                        {
                          weekOne: outline.firstWeek.join(', '),
                          peak: outline.peakRunMinutes,
                        }
                      )}
                </p>
              ) : null}
              <Button
                variant="outline"
                disabled={busy || isCurrent}
                onClick={() => onStart(program.id, programName(t, program.id))}
              >
                {t('trainingPrograms.picker.start', 'Start program')}
              </Button>
            </CardContent>
          </Card>
        );
      })}

      {customPrograms.length > 0 ? (
        <section className="space-y-3" data-testid="training-your-plans">
          <div>
            <h3 className="text-base font-semibold">
              {t('trainingPrograms.custom.title', 'Your plans')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                'trainingPrograms.custom.intro',
                'Plans you wrote or built in the mobile app. Start one to follow it like any program.'
              )}
            </p>
          </div>
          {customPrograms.map((plan) => {
            const id = customProgramId(plan.id);
            const isCurrent = storedProgramId === id;
            return (
              <Card key={plan.id} data-testid={`training-custom-${plan.id}`}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                  <div>
                    <p className="font-semibold">{plan.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'trainingPrograms.custom.workoutCount',
                        '{{count}} workouts',
                        {
                          count: plan.workouts.length,
                          defaultValue_one: '{{count}} workout',
                          defaultValue_other: '{{count}} workouts',
                        }
                      )}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy || isCurrent}
                    onClick={() => onStart(id, plan.name)}
                  >
                    {isCurrent
                      ? t('trainingPrograms.picker.current', 'Current program')
                      : t('trainingPrograms.picker.start', 'Start program')}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>
      ) : null}
    </div>
  );
};

export default TrainingProgramPicker;
