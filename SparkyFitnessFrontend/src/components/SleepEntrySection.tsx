import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { api } from '@/services/api';
import { debug, info, warn, error } from '@/utils/logging';
import { toast as sonnerToast } from "sonner";
import { Trash2, Edit, Save, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format, parseISO, differenceInMinutes, addDays } from 'date-fns';
import { SleepEntry, SleepStageEvent } from '@/types';
import SleepTimelineEditor from './SleepTimelineEditor';


interface SleepEntrySectionProps {
  selectedDate: string;
}

const SleepEntrySection: React.FC<SleepEntrySectionProps> = ({ selectedDate }) => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const { formatDateInUserTimezone, loggingLevel } = usePreferences();

  const [sleepSessions, setSleepSessions] = useState<Array<{ bedtime: string; wakeTime: string; stageEvents: SleepStageEvent[] }>>([{ bedtime: '', wakeTime: '', stageEvents: [] }]);
  const [sleepEntries, setSleepEntries] = useState<SleepEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null); // New state for editing

  const currentUserId = activeUserId;

  useEffect(() => {
    if (currentUserId && selectedDate) {
      fetchSleepEntries();
    }
  }, [currentUserId, selectedDate]);

  const fetchSleepEntries = async () => {
    if (!currentUserId) {
      warn(loggingLevel, "SleepEntrySection: fetchSleepEntries called with no current user ID.");
      return;
    }
    setLoading(true);
    try {
      const response = await api.get(`/sleep?startDate=${selectedDate}&endDate=${selectedDate}`);
      setSleepEntries(response);
      info(loggingLevel, "SleepEntrySection: Sleep entries fetched successfully:", response);
    } catch (err) {
      error(loggingLevel, 'SleepEntrySection: Error fetching sleep entries:', err);
      sonnerToast.error(t('sleepEntrySection.failedToLoadSleepEntries', 'Failed to load sleep entries'));
    } finally {
      setLoading(false);
    }
  };

  const handleSleepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUserId) {
      warn(loggingLevel, "SleepEntrySection: Submit called with no current user ID.");
      toast({
        title: t('sleepEntrySection.error', 'Error'),
        description: t('sleepEntrySection.mustBeLoggedInToSaveSleepData', 'You must be logged in to save sleep data'),
        variant: "destructive",
      });
      return;
    }

    for (const session of sleepSessions) {
      if (!session.bedtime || !session.wakeTime) {
        toast({
          title: t('sleepEntrySection.error', 'Error'),
          description: t('sleepEntrySection.enterBedtimeAndWakeTime', 'Please enter both bedtime and wake time for all sleep sessions.'),
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    try {
      for (const session of sleepSessions) {
        const parsedBedtime = parseISO(`${selectedDate}T${session.bedtime}`);
        let parsedWakeTime = parseISO(`${selectedDate}T${session.wakeTime}`);

        // If wake time is earlier than bedtime, assume it's on the next day
        if (parsedWakeTime < parsedBedtime) {
          parsedWakeTime = addDays(parsedWakeTime, 1);
        }

        const durationInMinutes = differenceInMinutes(parsedWakeTime, parsedBedtime);
        const durationInSeconds = durationInMinutes * 60;

        const sleepEntryData = {
          entry_date: selectedDate,
          bedtime: parsedBedtime.toISOString(),
          wake_time: parsedWakeTime.toISOString(),
          duration_in_seconds: durationInSeconds,
          source: 'manual',
          stage_events: session.stageEvents.map(event => ({
            ...event,
            entry_id: '', // Will be assigned by the backend
            id: event.id.startsWith('temp-') ? undefined : event.id, // Remove temporary IDs for new events
          })),
        };

        await api.post('/sleep/manual_entry', { body: sleepEntryData });
        info(loggingLevel, "SleepEntrySection: Sleep entry saved successfully.");
      }
      sonnerToast.success(t('sleepEntrySection.sleepEntriesSavedSuccessfully', 'Sleep entries saved successfully!'));
      setSleepSessions([{ bedtime: '', wakeTime: '', stageEvents: [] }]); // Reset form
      fetchSleepEntries(); // Refresh list
    } catch (err) {
      error(loggingLevel, 'SleepEntrySection: Error saving sleep entry:', err);
      toast({
        title: t('sleepEntrySection.error', 'Error'),
        description: t('sleepEntrySection.failedToSaveSleepEntry', 'Failed to save sleep entry'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddSleepSession = () => {
    setSleepSessions([...sleepSessions, { bedtime: '', wakeTime: '', stageEvents: [] }]);
  };

  const handleSleepSessionChange = (index: number, field: 'bedtime' | 'wakeTime', value: string) => {
    const updatedSessions = [...sleepSessions];
    updatedSessions[index] = { ...updatedSessions[index], [field]: value };
    setSleepSessions(updatedSessions);
  };

  const handleStageEventsPreviewChange = (index: number, events: SleepStageEvent[]) => {
    debug(loggingLevel, `SleepEntrySection: handleStageEventsPreviewChange for new session ${index}`, events);
    const updatedSessions = [...sleepSessions];
    updatedSessions[index] = { ...updatedSessions[index], stageEvents: events };
    setSleepSessions(updatedSessions);
  };

  const handleSaveNewSessionStageEvents = (index: number, events: SleepStageEvent[], newBedtime: string, newWakeTime: string) => {
    debug(loggingLevel, `SleepEntrySection: handleSaveNewSessionStageEvents for new session ${index}`, events, newBedtime, newWakeTime);
    const updatedSessions = [...sleepSessions];
    updatedSessions[index] = { ...updatedSessions[index], stageEvents: events, bedtime: newBedtime, wakeTime: newWakeTime };
    setSleepSessions(updatedSessions);
    sonnerToast.success(t('sleepEntrySection.newSessionStagesUpdatedLocally', 'Sleep stages and times for new session updated locally. Remember to save the main sleep entry.'));
  };

  const handleDiscardNewSessionStageEvents = (index: number) => {
    debug(loggingLevel, `SleepEntrySection: handleDiscardNewSessionStageEvents for new session ${index}`);
    const updatedSessions = [...sleepSessions];
    updatedSessions[index] = { ...updatedSessions[index], stageEvents: [] }; // Or revert to a default state if needed
    setSleepSessions(updatedSessions);
    sonnerToast.info(t('sleepEntrySection.newSessionStagesDiscarded', 'Sleep stage changes for new session discarded.'));
  };

  const handleSaveExistingEntryStageEvents = async (entryId: string, events: SleepStageEvent[], newBedtime: string, newWakeTime: string) => {
    debug(loggingLevel, `SleepEntrySection: handleSaveExistingEntryStageEvents for entry ${entryId}`, events, newBedtime, newWakeTime);
    if (!currentUserId) {
      warn(loggingLevel, "SleepEntrySection: handleSaveExistingEntryStageEvents called with no current user ID.");
      return;
    }
    setLoading(true);
    try {
      // Update the local state first for immediate visual feedback
      setSleepEntries(prevEntries =>
        prevEntries.map(entry =>
          entry.id === entryId ? { ...entry, stage_events: events, bedtime: newBedtime, wake_time: newWakeTime } : entry
        )
      );

      // Prepare events for API: assign entry_id and remove temporary IDs
      const eventsForApi = events.map(event => ({
        ...event,
        entry_id: entryId,
        id: event.id.startsWith('temp-') ? undefined : event.id,
      }));

      const parsedBedtime = parseISO(newBedtime);
      const parsedWakeTime = parseISO(newWakeTime);
      const durationInMinutes = differenceInMinutes(parsedWakeTime, parsedBedtime);
      const durationInSeconds = durationInMinutes * 60;
 
       await api.put(`/sleep/${entryId}`, { body: { stage_events: eventsForApi, bedtime: newBedtime, wake_time: newWakeTime, duration_in_seconds: durationInSeconds } });
       sonnerToast.success(t('sleepEntrySection.stagesUpdatedSuccessfully', 'Sleep stages and times updated successfully!'));
       info(loggingLevel, `SleepEntrySection: Sleep stages and times for entry ${entryId} updated successfully.`);
     } catch (err) {
       error(loggingLevel, `SleepEntrySection: Error updating sleep stages and times for entry ${entryId}:`, err);
       toast({
         title: t('sleepEntrySection.error', 'Error'),
         description: t('sleepEntrySection.failedToUpdateSleepStages', 'Failed to update sleep stages and times'),
         variant: "destructive",
       });
     } finally {
       setLoading(false);
     }
   };

  const handleDiscardExistingEntryStageEvents = (entryId: string) => {
    debug(loggingLevel, `SleepEntrySection: handleDiscardExistingEntryStageEvents for entry ${entryId}`);
    // Re-fetch the entry to revert changes
    fetchSleepEntries();
    sonnerToast.info(t('sleepEntrySection.stagesDiscarded', 'Sleep stage changes for existing entry discarded.'));
  };

  const handleDeleteSleepEntry = async (entryId: string) => {
    if (!currentUserId) {
      warn(loggingLevel, "SleepEntrySection: handleDeleteSleepEntry called with no current user ID.");
      return;
    }
    setLoading(true);
    try {
      await api.delete(`/sleep/${entryId}`);
      sonnerToast.success(t('sleepEntrySection.sleepEntryDeletedSuccessfully', 'Sleep entry deleted successfully!'));
      fetchSleepEntries(); // Refresh the list after deletion
    } catch (err) {
      error(loggingLevel, `SleepEntrySection: Error deleting sleep entry ${entryId}:`, err);
      toast({
        title: t('sleepEntrySection.error', 'Error'),
        description: t('sleepEntrySection.failedToDeleteSleepEntry', 'Failed to delete sleep entry'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('sleepEntrySection.sleepTracking', 'Sleep Tracking')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSleepSubmit} className="space-y-4">
          {sleepSessions.map((session, index) => (
            <div key={index} className="border p-4 rounded-lg space-y-4">
              <h4 className="text-md font-semibold">{t('sleepEntrySection.sleepSession', { sessionNumber: index + 1, defaultValue: `Sleep Session ${index + 1}` })}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`bedtime-${index}`}>{t('sleepEntrySection.bedtime', 'Bedtime')}</Label>
                  <Input
                    id={`bedtime-${index}`}
                    type="time"
                    value={session.bedtime}
                    onChange={(e) => handleSleepSessionChange(index, 'bedtime', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor={`wakeTime-${index}`}>{t('sleepEntrySection.wakeTime', 'Wake Time')}</Label>
                  <Input
                    id={`wakeTime-${index}`}
                    type="time"
                    value={session.wakeTime}
                    onChange={(e) => handleSleepSessionChange(index, 'wakeTime', e.target.value)}
                  />
                </div>
              </div>
              {session.bedtime && session.wakeTime && (() => {
                const parsedBedtimeForEditor = parseISO(`${selectedDate}T${session.bedtime}`);
                let parsedWakeTimeForEditor = parseISO(`${selectedDate}T${session.wakeTime}`);

                if (parsedWakeTimeForEditor < parsedBedtimeForEditor) {
                  parsedWakeTimeForEditor = addDays(parsedWakeTimeForEditor, 1);
                }

                debug(loggingLevel, `SleepEntrySection: Passing to SleepTimelineEditor - Bedtime: ${parsedBedtimeForEditor.toISOString()}, WakeTime: ${parsedWakeTimeForEditor.toISOString()}`);

                return (
                  <SleepTimelineEditor
                    bedtime={parsedBedtimeForEditor.toISOString()}
                    wakeTime={parsedWakeTimeForEditor.toISOString()}
                    initialStageEvents={session.stageEvents}
                    isEditing={true} // New sessions are always editable
                    onStageEventsPreviewChange={(events) => handleStageEventsPreviewChange(index, events)}
                    onSaveStageEvents={(events, newBedtime, newWakeTime) => handleSaveNewSessionStageEvents(index, events, newBedtime, newWakeTime)}
                    onDiscardChanges={() => handleDiscardNewSessionStageEvents(index)}
                  />
                );
              })()}
            </div>
          ))}
          <div className="flex justify-center space-x-2">
            <Button type="button" onClick={handleAddSleepSession} variant="outline" size="sm">
              {t('sleepEntrySection.addAnotherSleepSession', 'Add Another Sleep Session')}
            </Button>
            <Button type="submit" disabled={loading} size="sm">
              {loading ? t('sleepEntrySection.savingSleep', 'Saving Sleep...') : t('sleepEntrySection.saveSleep', 'Save Sleep')}
            </Button>
          </div>
        </form>

        {sleepEntries.length > 0 && (
          <div className="space-y-2 mt-6">
            {sleepEntries.map((entry) => (
              <div key={entry.id} className="border p-3 rounded-lg mb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-md font-semibold">Sleep Entry for {formatDateInUserTimezone(entry.bedtime, 'PPP')}</p>
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
                                onClick={() => setEditingEntryId(null)} // Cancel editing
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
                                  const entryToSave = sleepEntries.find(e => e.id === editingEntryId);
                                  if (entryToSave) {
                                    handleSaveExistingEntryStageEvents(
                                      entryToSave.id,
                                      entryToSave.stage_events || [],
                                      entryToSave.bedtime,
                                      entryToSave.wake_time
                                    );
                                  }
                                  setEditingEntryId(null);
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
                              onClick={() => setEditingEntryId(entry.id)} // Start editing
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
                {entry.bedtime && entry.wake_time && (() => {
                  const parsedBedtimeForEditor = parseISO(entry.bedtime);
                  let parsedWakeTimeForEditor = parseISO(entry.wake_time);

                  if (parsedWakeTimeForEditor < parsedBedtimeForEditor) {
                    parsedWakeTimeForEditor = addDays(parsedWakeTimeForEditor, 1);
                  }

                  debug(loggingLevel, `SleepEntrySection: Passing to SleepTimelineEditor (Existing) - Bedtime: ${parsedBedtimeForEditor.toISOString()}, WakeTime: ${parsedWakeTimeForEditor.toISOString()}`);

                  return (
                    <SleepTimelineEditor
                      bedtime={parsedBedtimeForEditor.toISOString()}
                      wakeTime={parsedWakeTimeForEditor.toISOString()}
                      initialStageEvents={entry.stage_events || []}
                      isEditing={editingEntryId === entry.id} // Pass isEditing prop
                      onStageEventsPreviewChange={(events) => {
                        setSleepEntries(prevEntries =>
                          prevEntries.map(prevEntry =>
                            prevEntry.id === entry.id ? { ...prevEntry, stage_events: events } : prevEntry
                          )
                        );
                      }}
                      onSaveStageEvents={(events, newBedtime, newWakeTime) => {
                        handleSaveExistingEntryStageEvents(entry.id, events, newBedtime, newWakeTime);
                        setEditingEntryId(null); // Exit editing mode after saving
                      }}
                      onDiscardChanges={() => {
                        handleDiscardExistingEntryStageEvents(entry.id);
                        setEditingEntryId(null); // Exit editing mode after discarding
                      }}
                      // Pass basic sleep entry details to SleepTimelineEditor for display
                      entryDetails={{
                        bedtime: formatDateInUserTimezone(entry.bedtime, 'p'),
                        wakeTime: formatDateInUserTimezone(entry.wake_time, 'p'),
                        duration: (entry.duration_in_seconds / 3600).toFixed(1),
                        sleepScore: entry.sleep_score,
                        source: entry.source,
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