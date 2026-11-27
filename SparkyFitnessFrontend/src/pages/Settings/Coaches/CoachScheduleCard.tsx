import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import {
  COACH_PAUSE_REASONS,
  MAX_COACH_CHECKIN_TIMES,
  MAX_COACH_MESSAGES_PER_DAY,
  type CoachSettingsResponse,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TimeInput } from '@/components/ui/TimeInput';
import { useUpdateCoachProfile } from '@/hooks/Coaches/useCoaches';

function nextFreeTime(times: readonly string[]): string {
  for (const candidate of ['08:00', '13:00', '19:00', '21:00', '07:00']) {
    if (!times.includes(candidate)) return candidate;
  }
  return '12:00';
}

interface Props {
  profile: CoachSettingsResponse['profile'];
}

export function CoachScheduleCard({ profile }: Props) {
  const { t } = useTranslation();
  const save = useUpdateCoachProfile();
  const [times, setTimes] = useState<string[]>(profile.checkin_times);
  const [maxMessages, setMaxMessages] = useState<number>(
    profile.max_messages_per_day
  );
  const [pausedUntil, setPausedUntil] = useState(profile.paused_until ?? '');
  const [reason, setReason] = useState<string>(profile.pause_reason ?? 'other');

  const isScheduleDirty =
    maxMessages !== profile.max_messages_per_day ||
    JSON.stringify(times) !== JSON.stringify(profile.checkin_times);

  const handleSaveSchedule = () => {
    const cleaned = [
      ...new Set(times.filter((v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v))),
    ].sort();
    setTimes(cleaned);
    save.mutate({
      checkin_times: cleaned,
      max_messages_per_day: maxMessages,
    });
  };

  const isPaused = profile.paused_until !== null;

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-semibold">
          {t('coaches.schedule.title', 'When coaches check in')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            'coaches.schedule.description',
            'Coaches only look at your data at these times, in your own time zone, and only speak when something is worth saying.'
          )}
        </p>
      </div>
      <div className="space-y-2">
        {times.map((time, index) => (
          <div key={`${index}`} className="flex items-center gap-2">
            <div className="w-40">
              <TimeInput
                value={time}
                aria-label={t('coaches.schedule.checkInTime', 'Check-in time')}
                onChange={(value) => {
                  if (value) {
                    setTimes((prev) =>
                      prev.map((item, i) => (i === index ? value : item))
                    );
                  }
                }}
              />
            </div>
            {times.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t(
                  'coaches.schedule.removeTime',
                  'Remove this time'
                )}
                onClick={() =>
                  setTimes((prev) => prev.filter((_, i) => i !== index))
                }
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {times.length < MAX_COACH_CHECKIN_TIMES && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTimes((prev) => [...prev, nextFreeTime(prev)])}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t('coaches.schedule.addTime', 'Add a time')}
          </Button>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="coach-max-messages">
            {t(
              'coaches.schedule.maxMessages',
              'At most this many messages a day'
            )}
          </Label>
          <InfoTooltip
            content={t(
              'coaches.schedule.maxMessagesTooltip',
              'Caps total messages across all active coaches each day to prevent notification spam and reduce AI usage.'
            )}
          />
        </div>
        <Input
          id="coach-max-messages"
          type="number"
          min={1}
          max={MAX_COACH_MESSAGES_PER_DAY}
          value={maxMessages}
          className="w-24"
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) setMaxMessages(val);
          }}
        />
      </div>
      <div>
        <Button
          onClick={handleSaveSchedule}
          disabled={save.isPending || !isScheduleDirty}
        >
          {t('common.save', 'Save')}
        </Button>
      </div>

      <div className="space-y-2 border-t pt-4">
        <h4 className="text-sm font-semibold">
          {t('coaches.pause.title', 'Pause coaches')}
        </h4>
        <p className="text-sm text-muted-foreground">
          {t(
            'coaches.pause.description',
            'Sick, travelling or injured? Coaches stay quiet until the date you choose.'
          )}
        </p>
        {isPaused && (
          <p className="text-sm font-medium">
            {t('coaches.pause.until', 'Paused until {{date}}.', {
              date: profile.paused_until,
            })}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="coach-pause-until">
              {t('coaches.pause.untilLabel', 'Until')}
            </Label>
            <Input
              id="coach-pause-until"
              type="date"
              value={pausedUntil}
              onChange={(event) => setPausedUntil(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coach-pause-reason">
              {t('coaches.pause.reason', 'Reason')}
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="coach-pause-reason" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COACH_PAUSE_REASONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`coaches.pause.reasons.${value}`, value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={!pausedUntil || save.isPending}
            onClick={() =>
              save.mutate({
                paused_until: pausedUntil,
                pause_reason: reason as (typeof COACH_PAUSE_REASONS)[number],
              })
            }
          >
            {t('coaches.pause.pause', 'Pause')}
          </Button>
          {isPaused && (
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => {
                setPausedUntil('');
                save.mutate({ paused_until: null, pause_reason: null });
              }}
            >
              {t('coaches.pause.resume', 'Resume now')}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
