import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info, warn, error } from '@/utils/logging';
import { Trash2, Edit, Save, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatLocalizedSeconds } from '@/utils/timeFormatters';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { parseISO, differenceInMinutes, addDays } from 'date-fns';
import type { SleepStageEvent } from '@/types';
import SleepTimelineEditor from './SleepTimelineEditor';
import {
  useDeleteSleepEntryMutation,
  useSaveSleepEntryMutation,
  useSleepEntriesQuery,
  useUpdateSleepEntryMutation,
} from '@/hooks/CheckIn/useSleep';

interface SleepEntrySectionProps {
  selectedDate: string;
}

const SleepEntrySection: React.FC<SleepEntrySectionProps> = ({
  selectedDate,
}) => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const { formatDateInUserTimezone, loggingLevel } = usePreferences();

  const [sleepSessions, setSleepSessions] = useState<
    Array<{ bedtime: string; wakeTime: string; stageEvents: SleepStageEvent[] }>
  >([{ bedtime: '', wakeTime: '', stageEvents: [] }]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null); // New state for editing

  const currentUserId = activeUserId;

  const { data: sleepEntries = [], isLoading: loading } = useSleepEntriesQuery(
    selectedDate,
    selectedDate
  );

  const { mutateAsync: saveSleepEntry } = useSaveSleepEntryMutation();
  const { mutateAsync: updateSleepEntry } = useUpdateSleepEntryMutation();
  const { mutateAsync: deleteSleepEntry } = useDeleteSleepEntryMutation();

  const [existingEditDraft, setExistingEditDraft] = useState<{
    stageEvents: SleepStageEvent[];
    bedtime: string;
    wakeTime: string;
  } | null>(null);
  const handleSleepSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();

    if (!currentUserId) {
      warn(
        loggingLevel,
        'SleepEntrySection: Submit called with no current user ID.'
      );
      toast({
        title: t('sleepEntrySection.error', 'Error'),
        description: t(
          'sleepEntrySection.mustBeLoggedInToSaveSleepData',
          'You must be logged in to save sleep data'
        ),
        variant: 'destructive',
      });
      return;
    }

    for (const session of sleepSessions) {
      if (!session.bedtime || !session.wakeTime) {
        toast({
          title: t('sleepEntrySection.error', 'Error'),
          description: t(
            'sleepEntrySection.enterBedtimeAndWakeTime',
            'Please enter both bedtime and wake time for all sleep sessions.'
          ),
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      const savePromises = sleepSessions.map(async (session) => {
        let parsedBedtime = parseISO(`${selectedDate}T${session.bedtime}`);
        const parsedWakeTime = parseISO(`${selectedDate}T${session.wakeTime}`);

        if (parsedBedtime > parsedWakeTime) {
          // If bedtime is later than wake time, the user went to bed the night BEFORE
          parsedBedtime = addDays(parsedBedtime, -1);
        }

        const durationInMinutes = differenceInMinutes(
          parsedWakeTime,
          parsedBedtime
        );
        const durationInSeconds = durationInMinutes * 60;

        const sleepEntryData = {
          entry_date: selectedDate,
          bedtime: parsedBedtime.toISOString(),
          wake_time: parsedWakeTime.toISOString(),
          duration_in_seconds: Number(durationInSeconds) || 0,
          source: 'manual',
          stage_events: session.stageEvents
            .filter((event) => event)
            .map((event) => ({
              ...event,
              duration_in_seconds: Number(event.duration_in_seconds) || 0,
              entry_id: '',
              id: event.id.startsWith('temp-') ? '' : event.id,
            })),
        };

        await saveSleepEntry(sleepEntryData);
        info(
          loggingLevel,
          'SleepEntrySection: Sleep entry saved successfully.'
        );
      });

      await Promise.all(savePromises);
      setSleepSessions([{ bedtime: '', wakeTime: '', stageEvents: [] }]); // Reset form
    } catch (err) {
      error(loggingLevel, 'SleepEntrySection: Error saving sleep entry:', err);
    }
  };

  const handleAddSleepSession = () => {
    setSleepSessions([
      ...sleepSessions,
      { bedtime: '', wakeTime: '', stageEvents: [] },
    ]);
  };

  const handleSleepSessionChange = (
    index: number,
    field: 'bedtime' | 'wakeTime',
    value: string
  ) => {
    const session = sleepSessions[index];
    if (!session) {
      return;
    }

    const updatedSessions = [...sleepSessions];
    updatedSessions[index] = { ...session, [field]: value };
    setSleepSessions(updatedSessions);
  };

  const handleStageEventsPreviewChange = (
    index: number,
    events: SleepStageEvent[]
  ) => {
    debug(
      loggingLevel,
      `SleepEntrySection: handleStageEventsPreviewChange for new session ${index}`,
      events
    );
    const session = sleepSessions[index];
    if (!session) {
      return;
    }

    const updatedSessions = [...sleepSessions];
    updatedSessions[index] = { ...session, stageEvents: events };
    setSleepSessions(updatedSessions);
  };

  const handleSaveExistingEntryStageEvents = async (
    entryId: string,
    events: SleepStageEvent[],
    newBedtime: string,
    newWakeTime: string
  ) => {
    if (!currentUserId) return;

    const eventsForApi = events.map((event) => ({
      ...event,
      entry_id: entryId,
      id: event.id.startsWith('temp-') ? '' : event.id,
    }));

    const durationInSeconds =
      differenceInMinutes(parseISO(newWakeTime), parseISO(newBedtime)) * 60;

    await updateSleepEntry({
      id: entryId,
      data: {
        stage_events: eventsForApi,
        bedtime: newBedtime,
        wake_time: newWakeTime,
        duration_in_seconds: durationInSeconds,
      },
    });

    setEditingEntryId(null);
  };

  const handleDeleteSleepEntry = async (entryId: string) => {
    if (!currentUserId) {
      warn(
        loggingLevel,
        'SleepEntrySection: handleDeleteSleepEntry called with no current user ID.'
      );
      return;
    }
    try {
      await deleteSleepEntry(entryId);
    } catch (err) {
      error(
        loggingLevel,
        `SleepEntrySection: Error deleting sleep entry ${entryId}:`,
        err
      );
    }
  };

  if (loading) {
    return (
      <div role="status" className="py-8 text-center text-muted-foreground">
        {t('sleepEntrySection.loading', 'Loading sleep data…')}
      </div>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('sleepEntrySection.sleepTracking', 'Sleep Tracking')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSleepSubmit} className="space-y-4">
          {sleepSessions.map((session, index) => (
            <div key={index} className="space-y-4 rounded-lg border p-4">
              <h4 className="text-md font-semibold">
                {t('sleepEntrySection.sleepSession', {
                  sessionNumber: index + 1,
                  defaultValue: `Sleep Session ${index + 1}`,
                })}
              </h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor={`bedtime-${index}`}>
                    {t('sleepEntrySection.bedtime', 'Bedtime')}
                  </Label>
                  <Input
                    id={`bedtime-${index}`}
                    type="time"
                    dir="ltr"
                    value={session.bedtime}
                    onChange={(e) =>
                      handleSleepSessionChange(index, 'bedtime', e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label htmlFor={`wakeTime-${index}`}>
                    {t('sleepEntrySection.wakeTime', 'Wake Time')}
                  </Label>
                  <Input
                    id={`wakeTime-${index}`}
                    type="time"
                    dir="ltr"
                    value={session.wakeTime}
                    onChange={(e) =>
                      handleSleepSessionChange(
                        index,
                        'wakeTime',
                        e.target.value
                      )
                    }
                  />
                </div>
              </div>
              {session.bedtime &&
                session.wakeTime &&
                (() => {
                  let parsedBedtimeForEditor = parseISO(
                    `${selectedDate}T${session.bedtime}`
                  );
                  const parsedWakeTimeForEditor = parseISO(
                    `${selectedDate}T${session.wakeTime}`
                  );

                  if (parsedBedtimeForEditor > parsedWakeTimeForEditor) {
                    // Look back: User went to bed the night before today's wake-up
                    parsedBedtimeForEditor = addDays(
                      parsedBedtimeForEditor,
                      -1
                    );
                  }

                  debug(
                    loggingLevel,
                    `SleepEntrySection: Passing to SleepTimelineEditor - Bedtime: ${parsedBedtimeForEditor.toISOString()}, WakeTime: ${parsedWakeTimeForEditor.toISOString()}`
                  );

                  return (
                    <SleepTimelineEditor
                      key={`new-session-${index}-${selectedDate}`}
                      bedtime={parsedBedtimeForEditor.toISOString()}
                      wakeTime={parsedWakeTimeForEditor.toISOString()}
                      initialStageEvents={session.stageEvents}
                      isEditing={true} // New sessions are always editable
                      onStageEventsPreviewChange={(events) =>
                        handleStageEventsPreviewChange(index, events)
                      }
                    />
                  );
                })()}
            </div>
          ))}
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={handleAddSleepSession}
              variant="outline"
              size="sm"
            >
              {t(
                'sleepEntrySection.addAnotherSleepSession',
                'Add Another Sleep Session'
              )}
            </Button>
            <Button type="submit" disabled={loading} size="sm">
              {loading
                ? t('sleepEntrySection.savingSleep', 'Saving Sleep...')
                : t('sleepEntrySection.saveSleep', 'Save Sleep')}
            </Button>
          </div>
        </form>

        {sleepEntries.length > 0 && (
          <div className="mt-6 space-y-2">
            {sleepEntries.map((entry) => (
              <div key={entry.id} className="mb-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-md font-semibold">
                      {t(
                        'sleepEntrySection.sleepEntryFor',
                        'Sleep entry for {{date}}',
                        {
                          date: formatDateInUserTimezone(
                            entry.entry_date,
                            'PPP'
                          ),
                        }
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {editingEntryId === entry.id ? (
                      <>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                type="button"
                                aria-label={t(
                                  'sleepEntrySection.cancelEdit',
                                  'Cancel sleep entry edit'
                                )}
                                onClick={() => {
                                  setEditingEntryId(null);
                                  setExistingEditDraft(null);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {t(
                                  'sleepEntrySection.cancelEdit',
                                  'Cancel sleep entry edit'
                                )}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                type="button"
                                aria-label={t(
                                  'sleepEntrySection.saveEdit',
                                  'Save sleep entry edit'
                                )}
                                onClick={() => {
                                  if (existingEditDraft) {
                                    handleSaveExistingEntryStageEvents(
                                      entry.id,
                                      existingEditDraft.stageEvents,
                                      existingEditDraft.bedtime,
                                      existingEditDraft.wakeTime
                                    );
                                  } else {
                                    setEditingEntryId(null);
                                  }
                                }}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {t(
                                  'sleepEntrySection.saveEdit',
                                  'Save sleep entry edit'
                                )}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              type="button"
                              aria-label={t(
                                'sleepEntrySection.editEntry',
                                'Edit sleep entry'
                              )}
                              onClick={() => {
                                setEditingEntryId(entry.id);
                                setExistingEditDraft({
                                  stageEvents: entry.stage_events || [],
                                  bedtime: entry.bedtime,
                                  wakeTime: entry.wake_time,
                                });
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              {t(
                                'sleepEntrySection.editEntry',
                                'Edit sleep entry'
                              )}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          type="button"
                          aria-label={t(
                            'sleepEntrySection.deleteEntry',
                            'Delete sleep entry'
                          )}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t(
                              'sleepEntrySection.deleteConfirmTitle',
                              'Delete this sleep entry?'
                            )}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t(
                              'sleepEntrySection.deleteConfirmDescription',
                              'This removes the entry and its sleep stages. This action cannot be undone.'
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t('sleepEntrySection.cancel', 'Cancel')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleDeleteSleepEntry(entry.id)}
                          >
                            {t(
                              'sleepEntrySection.deleteConfirmAction',
                              'Delete entry'
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                {entry.bedtime &&
                  entry.wake_time &&
                  (() => {
                    const parsedBedtimeForEditor = parseISO(entry.bedtime);
                    let parsedWakeTimeForEditor = parseISO(entry.wake_time);

                    if (parsedWakeTimeForEditor < parsedBedtimeForEditor) {
                      parsedWakeTimeForEditor = addDays(
                        parsedWakeTimeForEditor,
                        1
                      );
                    }

                    debug(
                      loggingLevel,
                      `SleepEntrySection: Passing to SleepTimelineEditor (Existing) - Bedtime: ${parsedBedtimeForEditor.toISOString()}, WakeTime: ${parsedWakeTimeForEditor.toISOString()}`
                    );

                    return (
                      <SleepTimelineEditor
                        key={`${entry.id}-${editingEntryId === entry.id}`}
                        bedtime={parsedBedtimeForEditor.toISOString()}
                        wakeTime={parsedWakeTimeForEditor.toISOString()}
                        initialStageEvents={entry.stage_events || []}
                        isEditing={editingEntryId === entry.id} // Pass isEditing prop
                        onTimeChange={(bHHmm, wHHmm) => {
                          try {
                            const bIso = parseISO(
                              `${selectedDate}T${bHHmm}`
                            ).toISOString();
                            let wIso = parseISO(`${selectedDate}T${wHHmm}`);
                            if (wIso < parseISO(`${selectedDate}T${bHHmm}`)) {
                              wIso = addDays(wIso, 1);
                            }
                            setExistingEditDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    bedtime: bIso,
                                    wakeTime: wIso.toISOString(),
                                  }
                                : null
                            );
                          } catch (error) {
                            console.error(error);
                          }
                        }}
                        // Pass basic sleep entry details to SleepTimelineEditor for display
                        entryDetails={{
                          bedtime: formatDateInUserTimezone(entry.bedtime, 'p'),
                          wakeTime: formatDateInUserTimezone(
                            entry.wake_time,
                            'p'
                          ),
                          duration: formatLocalizedSeconds(
                            entry.duration_in_seconds,
                            t
                          ),
                          timeAsleep:
                            entry.time_asleep_in_seconds !== null
                              ? formatLocalizedSeconds(
                                  entry.time_asleep_in_seconds,
                                  t
                                )
                              : undefined,
                          sleepScore: entry.sleep_score ?? 0,
                          source: entry.source,
                          deepSleepSeconds: entry.deep_sleep_seconds,
                          lightSleepSeconds: entry.light_sleep_seconds,
                          remSleepSeconds: entry.rem_sleep_seconds,
                          awakeSleepSeconds: entry.awake_sleep_seconds,
                          averageSpo2Value: entry.average_spo2_value,
                          lowestSpo2Value: entry.lowest_spo2_value,
                          highestSpo2Value: entry.highest_spo2_value,
                          averageRespirationValue:
                            entry.average_respiration_value,
                          lowestRespirationValue:
                            entry.lowest_respiration_value,
                          highestRespirationValue:
                            entry.highest_respiration_value,
                          awakeCount: entry.awake_count,
                          avgSleepStress: entry.avg_sleep_stress,
                          restlessMomentsCount: entry.restless_moments_count,
                          avgOvernightHrv: entry.avg_overnight_hrv,
                          bodyBatteryChange: entry.body_battery_change,
                          restingHeartRate: entry.resting_heart_rate,
                        }}
                      />
                    );
                  })()}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SleepEntrySection;
