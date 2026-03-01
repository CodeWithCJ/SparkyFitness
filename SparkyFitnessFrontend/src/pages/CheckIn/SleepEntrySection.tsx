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
import { toast as sonnerToast } from 'sonner';
import { Trash2, Edit, Save, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatSecondsToHHMM } from '@/utils/timeFormatters';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  const handleSleepSubmit = async (e: React.FormEvent) => {
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
              id: event.id.startsWith('temp-') ? undefined : event.id,
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
    const updatedSessions = [...sleepSessions];
    updatedSessions[index] = { ...updatedSessions[index], [field]: value };
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
    const updatedSessions = [...sleepSessions];
    updatedSessions[index] = { ...updatedSessions[index], stageEvents: events };
    setSleepSessions(updatedSessions);
  };

  const handleSaveNewSessionStageEvents = (
    index: number,
    events: SleepStageEvent[],
    newBedtime: string,
    newWakeTime: string
  ) => {
    debug(
      loggingLevel,
      `SleepEntrySection: handleSaveNewSessionStageEvents for new session ${index}`,
      events,
      newBedtime,
      newWakeTime
    );
    const updatedSessions = [...sleepSessions];
    updatedSessions[index] = {
      ...updatedSessions[index],
      stageEvents: events,
      bedtime: newBedtime,
      wakeTime: newWakeTime,
    };
    setSleepSessions(updatedSessions);
    sonnerToast.success(
      t(
        'sleepEntrySection.newSessionStagesUpdatedLocally',
        'Sleep stages and times for new session updated locally. Remember to save the main sleep entry.'
      )
    );
  };

  const handleDiscardNewSessionStageEvents = (index: number) => {
    debug(
      loggingLevel,
      `SleepEntrySection: handleDiscardNewSessionStageEvents for new session ${index}`
    );
    const updatedSessions = [...sleepSessions];
    updatedSessions[index] = { ...updatedSessions[index], stageEvents: [] }; // Or revert to a default state if needed
    setSleepSessions(updatedSessions);
    sonnerToast.info(
      t(
        'sleepEntrySection.newSessionStagesDiscarded',
        'Sleep stage changes for new session discarded.'
      )
    );
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
      id: event.id.startsWith('temp-') ? undefined : event.id,
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

  if (loading) return <div>Loading...</div>;
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
            <div key={index} className="border p-4 rounded-lg space-y-4">
              <h4 className="text-md font-semibold">
                {t('sleepEntrySection.sleepSession', {
                  sessionNumber: index + 1,
                  defaultValue: `Sleep Session ${index + 1}`,
                })}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`bedtime-${index}`}>
                    {t('sleepEntrySection.bedtime', 'Bedtime')}
                  </Label>
                  <Input
                    id={`bedtime-${index}`}
                    type="time"
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
          <div className="flex justify-center space-x-2">
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
          <div className="space-y-2 mt-6">
            {sleepEntries.map((entry) => (
              <div key={entry.id} className="border p-3 rounded-lg mb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-md font-semibold">
                      Sleep Entry for{' '}
                      {formatDateInUserTimezone(entry.entry_date, 'PPP')}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    {editingEntryId === entry.id ? (
                      <>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => {
                                  setEditingEntryId(null);
                                  setExistingEditDraft(null);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Cancel</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
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
                              <p>Save</p>
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
                            <p>Edit</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleDeleteSleepEntry(entry.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
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
                          duration: formatSecondsToHHMM(
                            entry.duration_in_seconds
                          ),
                          timeAsleep:
                            entry.time_asleep_in_seconds !== null
                              ? formatSecondsToHHMM(
                                  entry.time_asleep_in_seconds
                                )
                              : undefined,
                          sleepScore: entry.sleep_score,
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
