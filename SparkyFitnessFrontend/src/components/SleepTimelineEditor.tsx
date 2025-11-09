import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from "react-i18next";
import { format, parseISO, differenceInMinutes, addMinutes, isSameMinute, isBefore, isAfter } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input"; // Added Input import
import { Label } from "@/components/ui/label"; // Added Label import
import { Slider } from "@/components/ui/slider";
import { SleepStageEvent, SLEEP_STAGE_COLORS } from '@/types';

interface SleepTimelineEditorProps {
  bedtime: string;
  wakeTime: string;
  initialStageEvents?: SleepStageEvent[];
  onStageEventsPreviewChange?: (events: SleepStageEvent[]) => void;
  onSaveStageEvents?: (events: SleepStageEvent[], newBedtime: string, newWakeTime: string) => void;
  onDiscardChanges?: () => void;
  isEditing?: boolean; // New prop
  entryDetails?: { // New prop for displaying details
    bedtime: string;
    wakeTime: string;
    duration: string;
    sleepScore?: number;
    source?: string;
  };
}


const SleepTimelineEditor: React.FC<SleepTimelineEditorProps> = ({
  bedtime,
  wakeTime,
  initialStageEvents = [],
  onStageEventsPreviewChange,
  onSaveStageEvents,
  onDiscardChanges,
  isEditing = false,
  entryDetails,
}) => {
 const { t } = useTranslation();
  const parsedBedtime = useMemo(() => parseISO(bedtime), [bedtime]);
  const parsedWakeTime = useMemo(() => parseISO(wakeTime), [wakeTime]);
  const totalDurationMinutes = useMemo(() => differenceInMinutes(parsedWakeTime, parsedBedtime), [parsedBedtime, parsedWakeTime]);

  const [stageEvents, setStageEvents] = useState<SleepStageEvent[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedStageType, setSelectedStageType] = useState<'awake' | 'rem' | 'light' | 'deep' | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartTime, setDragStartTime] = useState<Date | null>(null);

  const [editableBedtime, setEditableBedtime] = useState(format(parsedBedtime, 'HH:mm'));
  const [editableWakeTime, setEditableWakeTime] = useState(format(parsedWakeTime, 'HH:mm'));

  useEffect(() => {
    setEditableBedtime(format(parsedBedtime, 'HH:mm'));
    setEditableWakeTime(format(parsedWakeTime, 'HH:mm'));
  }, [parsedBedtime, parsedWakeTime]);

  useEffect(() => {
    const filteredInitialEvents = initialStageEvents?.filter(Boolean) as SleepStageEvent[] || [];
    if (filteredInitialEvents.length > 0) {
      setStageEvents(filteredInitialEvents);
    } else {
      const duration = totalDurationMinutes * 60;
      setStageEvents([{
        id: `initial-light-${Date.now()}`,
        entry_id: '',
        stage_type: 'light',
        start_time: parsedBedtime.toISOString(),
        end_time: parsedWakeTime.toISOString(),
        duration_in_seconds: duration,
      }]);
    }
    setHasUnsavedChanges(false);
  }, [initialStageEvents, parsedBedtime, parsedWakeTime, totalDurationMinutes]);

  const getNearest15MinuteInterval = useCallback((date: Date) => {
    const minutes = date.getMinutes();
    const roundedMinutes = Math.round(minutes / 15) * 15;
    const newDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), roundedMinutes);
    return newDate;
  }, []);

  const getPositionAndWidth = useCallback((start: string, end: string) => {
    const startDateTime = parseISO(start);
    const endDateTime = parseISO(end);

    const offsetMinutes = differenceInMinutes(startDateTime, parsedBedtime);
    const segmentDurationMinutes = differenceInMinutes(endDateTime, startDateTime);

    const left = (offsetMinutes / totalDurationMinutes) * 100;
    const width = (segmentDurationMinutes / totalDurationMinutes) * 100;

    return { left, width };
  }, [parsedBedtime, totalDurationMinutes]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !selectedStageType) return;

    setIsDragging(true);
    const timelineRect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - timelineRect.left;
    const percentage = clickX / timelineRect.width;
    const minutesOffset = totalDurationMinutes * percentage;
    const clickedTime = addMinutes(parsedBedtime, minutesOffset);
    const snappedTime = getNearest15MinuteInterval(clickedTime);
    setDragStartTime(snappedTime);
  }, [selectedStageType, totalDurationMinutes, parsedBedtime, getNearest15MinuteInterval]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !timelineRef.current || !dragStartTime) return;

    const timelineRect = timelineRef.current.getBoundingClientRect();
    const currentX = e.clientX - timelineRect.left;
    const percentage = currentX / timelineRect.width;
    const minutesOffset = totalDurationMinutes * percentage;
    const currentTime = addMinutes(parsedBedtime, minutesOffset);
    const snappedCurrentTime = getNearest15MinuteInterval(currentTime);

    if (isSameMinute(snappedCurrentTime, dragStartTime)) return;

    const newStart = isBefore(dragStartTime, snappedCurrentTime) ? dragStartTime : snappedCurrentTime;
    const newEnd = isAfter(dragStartTime, snappedCurrentTime) ? dragStartTime : snappedCurrentTime;

    if (selectedStageType === null) { // Clear mode
      setStageEvents(prevEvents => prevEvents.filter(event =>
        !(
          (parseISO(event.start_time) < newEnd && parseISO(event.end_time) > newStart) || // Event overlaps with cleared range
          (parseISO(event.start_time) >= newStart && parseISO(event.end_time) <= newEnd) // Event is within cleared range
        )
      ));
    } else { // Painting mode
      const duration = differenceInMinutes(newEnd, newStart) * 60;

      if (duration > 0) {
        const newEvent: SleepStageEvent = {
          id: `temp-${Date.now()}`, // Temporary ID
          entry_id: '', // Will be filled on save
          stage_type: selectedStageType,
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
          duration_in_seconds: duration,
        };

        setStageEvents(prevEvents => {
          // Filter out any existing events that overlap with the new event, and ensure no nulls
          const filteredEvents = prevEvents.filter(event =>
            event && event.start_time && event.end_time && !(
              (parseISO(event.start_time) < parseISO(newEvent.end_time) && parseISO(event.end_time) > parseISO(newEvent.start_time))
            )
          );
          return [...filteredEvents, newEvent];
        });
        setHasUnsavedChanges(true);
      }
    }
  }, [isDragging, dragStartTime, selectedStageType, totalDurationMinutes, parsedBedtime, getNearest15MinuteInterval]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragStartTime(null);

    // Consolidate overlapping/adjacent events of the same type, filtering out any nulls
    const consolidatedEvents = stageEvents.filter(Boolean).sort((a, b) =>
      parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
    ).reduce((acc: SleepStageEvent[], currentEvent) => {
      if (acc.length === 0) {
        return [currentEvent];
      }

      const lastEvent = acc[acc.length - 1];

      // Check for overlap or adjacency with the same stage type
      if (
        lastEvent.stage_type === currentEvent.stage_type &&
        (
          isBefore(parseISO(currentEvent.start_time), parseISO(lastEvent.end_time)) ||
          isSameMinute(parseISO(currentEvent.start_time), parseISO(lastEvent.end_time))
        )
      ) {
        // Merge events
        const mergedStart = parseISO(lastEvent.start_time);
        const mergedEnd = isAfter(parseISO(currentEvent.end_time), parseISO(lastEvent.end_time))
          ? parseISO(currentEvent.end_time)
          : parseISO(lastEvent.end_time);

        const duration = differenceInMinutes(mergedEnd, mergedStart) * 60;

        acc[acc.length - 1] = {
          ...lastEvent,
          end_time: mergedEnd.toISOString(),
          duration_in_seconds: duration,
        };
      } else {
        acc.push(currentEvent);
      }
      return acc;
    }, []);

    setStageEvents(consolidatedEvents); // Update local state with consolidated events
    setHasUnsavedChanges(true); // Mark as unsaved after consolidation

    if (onStageEventsPreviewChange) {
      onStageEventsPreviewChange(consolidatedEvents);
    }
  }, [onStageEventsPreviewChange, stageEvents]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, handleMouseUp]);

  const handleSave = () => {
   if (onSaveStageEvents) {
     onSaveStageEvents(stageEvents, editableBedtime, editableWakeTime);
     setHasUnsavedChanges(false);
   }
 };

 const handleDiscard = () => {
   if (onDiscardChanges) {
     onDiscardChanges();
   }
   // Revert to initial state
   const filteredInitialEvents = initialStageEvents?.filter(Boolean) as SleepStageEvent[] || [];
   if (filteredInitialEvents.length > 0) {
     setStageEvents(filteredInitialEvents);
   } else {
     const duration = totalDurationMinutes * 60;
     setStageEvents([{
       id: `initial-light-${Date.now()}`,
       entry_id: '',
       stage_type: 'light',
       start_time: parsedBedtime.toISOString(),
       end_time: parsedWakeTime.toISOString(),
       duration_in_seconds: duration,
     }]);
   }
   setHasUnsavedChanges(false);
   setEditableBedtime(format(parsedBedtime, 'HH:mm'));
   setEditableWakeTime(format(parsedWakeTime, 'HH:mm'));
 };

  return (
    <div className="sleep-timeline-editor border p-4 rounded-lg mb-4">
      {entryDetails && (
        <div className="mb-4 text-sm text-gray-600 grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-4">
          {isEditing ? (
            <>
              <div>
                <Label htmlFor="edit-bedtime">{t('sleepTimelineEditor.bedtime', 'Bedtime')}</Label>
                <Input
                  id="edit-bedtime"
                  type="time"
                  value={editableBedtime}
                  onChange={(e) => { setEditableBedtime(e.target.value); setHasUnsavedChanges(true); }}
                />
              </div>
              <div>
                <Label htmlFor="edit-wakeTime">{t('sleepTimelineEditor.wakeTime', 'Wake Time')}</Label>
                <Input
                  id="edit-wakeTime"
                  type="time"
                  value={editableWakeTime}
                  onChange={(e) => { setEditableWakeTime(e.target.value); setHasUnsavedChanges(true); }}
                />
              </div>
            </>
          ) : (
            <>
              <p><b>{t('sleepTimelineEditor.bedtime', 'Bedtime')}:</b> {entryDetails.bedtime}</p>
              <p><b>{t('sleepTimelineEditor.wakeTime', 'Wake Time')}:</b> {entryDetails.wakeTime}</p>
            </>
          )}
          <p><b>{t('sleepTimelineEditor.duration', 'Duration')}:</b> {entryDetails.duration} hours</p>
          {entryDetails.sleepScore && <p><b>{t('sleepTimelineEditor.sleepScore', 'Sleep Score')}:</b> {entryDetails.sleepScore}</p>}
          {entryDetails.source && <p><b>{t('sleepTimelineEditor.source', 'Source')}:</b> {entryDetails.source}</p>}
        </div>
      )}

      <h4 className="text-md font-semibold mb-2">{t('sleepTimelineEditor.sleepTimeline', 'Sleep Timeline')}</h4>

      {isEditing && ( // Conditionally render buttons for editing mode
        <div className="flex space-x-2 mb-4">
          {['awake', 'rem', 'light', 'deep'].map((stageType) => (
            <Button
              key={stageType}
              type="button"
              onClick={() => setSelectedStageType(stageType as 'awake' | 'rem' | 'light' | 'deep')}
              style={{ backgroundColor: selectedStageType === stageType ? SLEEP_STAGE_COLORS[stageType as keyof typeof SLEEP_STAGE_COLORS] : '#E5E7EB' }}
              className="text-black"
            >
              {t(`sleepTimelineEditor.${stageType}`, stageType.charAt(0).toUpperCase() + stageType.slice(1))}
            </Button>
          ))}
          <Button
            type="button"
            onClick={() => {
              setStageEvents([]); // Clear all stage events
              setSelectedStageType(null); // Set to clear mode
              setHasUnsavedChanges(true); // Mark as unsaved
              if (onStageEventsPreviewChange) {
                onStageEventsPreviewChange([]); // Notify parent of cleared events
              }
            }}
            className={`${selectedStageType === null ? 'bg-gray-400' : 'bg-gray-200'} text-black`}
          >
            {t('sleepTimelineEditor.clear', 'Clear')}
          </Button>
        </div>
      )}

      {/* Sleep Stage Color Legend */}
      <div className="flex flex-wrap gap-2 mb-4 text-sm">
        {Object.entries(SLEEP_STAGE_COLORS).map(([stage, color]) => (
          <div key={stage} className="flex items-center">
            <span className="w-4 h-4 rounded-full mr-1" style={{ backgroundColor: color }}></span>
            <span>{t(`sleepTimelineEditor.${stage}`, stage.charAt(0).toUpperCase() + stage.slice(1))}</span>
          </div>
        ))}
      </div>

      <div
        ref={timelineRef}
        className={`relative h-12 bg-gray-100 rounded-md ${isEditing ? 'cursor-crosshair' : ''}`}
        onMouseDown={isEditing ? handleMouseDown : undefined}
        onMouseMove={isEditing ? handleMouseMove : undefined}
        onMouseUp={isEditing ? handleMouseUp : undefined}
        onMouseLeave={isEditing ? handleMouseUp : undefined}
      >
        {/* Time Axis - hourly markers */}
        <div className="absolute inset-0 flex text-xs text-gray-500">
          {Array.from({ length: totalDurationMinutes / 60 + 1 }).map((_, i) => {
            const hourTime = addMinutes(parsedBedtime, i * 60);
            const left = (i * 60 / totalDurationMinutes) * 100;
            return (
              <span key={`hour-${i}`} className="absolute" style={{ left: `${left}%` }}>
                {format(hourTime, 'HH:mm')}
              </span>
            );
          })}
        </div>

        {/* Render existing stage events */}
        {stageEvents.filter(Boolean).map((event, index) => {
          if (!event || !event.start_time || !event.end_time) {
            console.warn("Invalid sleep stage event found:", event);
            return null;
          }
          const { left, width } = getPositionAndWidth(event.start_time, event.end_time);
          return (
            <div
              key={event.id || index}
              className="absolute h-full rounded-md opacity-75"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: SLEEP_STAGE_COLORS[event.stage_type],
              }}
              title={`${event.stage_type}: ${format(parseISO(event.start_time), 'p')} - ${format(parseISO(event.end_time), 'p')}`}
            />
          );
        })}
      </div>
      {/* The main save button in SleepEntrySection now handles saving.
          The internal save/discard buttons have been removed to avoid confusion. */}
    </div>
  );
};

export default SleepTimelineEditor;