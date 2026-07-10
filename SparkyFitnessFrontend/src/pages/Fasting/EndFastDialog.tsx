import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';

interface EndFastDialogProps {
  isOpen: boolean;
  onClose: () => void;
  // onEnd may receive optional weight, mood, and custom start/end Date values
  onEnd: (
    startTime: Date,
    endTime: Date,
    weight?: number,
    mood?: { value: number; notes: string }
  ) => void;
  durationFormatted: string;
  initialStartISO?: string | null;
  initialEndISO?: string | null;
}

const EndFastDialog: React.FC<EndFastDialogProps> = ({
  isOpen,
  onClose,
  onEnd,
  durationFormatted,
  initialStartISO = null,
  initialEndISO = null,
}) => {
  const { t } = useTranslation();
  const [timeError, setTimeError] = React.useState('');
  const formatForLocalInput = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [startLocal, setStartLocal] = React.useState<string>(() => {
    if (initialStartISO) {
      const d = new Date(initialStartISO);
      return formatForLocalInput(d);
    }
    return '';
  });
  const [endLocal, setEndLocal] = React.useState<string>(() => {
    if (initialEndISO) {
      const d = new Date(initialEndISO);
      return formatForLocalInput(d);
    }
    return '';
  });

  // Sync local inputs when props change (dialog may mount before activeFast is available)
  React.useEffect(() => {
    try {
      if (initialStartISO)
        setStartLocal(formatForLocalInput(new Date(initialStartISO)));
      if (initialEndISO)
        setEndLocal(formatForLocalInput(new Date(initialEndISO)));
      setTimeError('');
    } catch (e) {
      // ignore
    }
  }, [initialStartISO, initialEndISO, isOpen]);

  const handleConfirm = () => {
    // Convert local datetime-local value back to a Date object in user's local timezone
    const start = startLocal ? new Date(startLocal) : new Date();
    const end = endLocal ? new Date(endLocal) : new Date();
    if (end <= start) {
      setTimeError(
        t(
          'fasting.invalidTimeRange',
          'The end time must be after the start time.'
        )
      );
      return;
    }
    onEnd(start, end);
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('fasting.endDialogTitle', 'Fast complete')}
          </DialogTitle>
          <DialogDescription>
            {t('fasting.endDialogDescription', 'You fasted for {{duration}}.', {
              duration: durationFormatted,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-center text-muted-foreground">
            {t(
              'fasting.endDialogHelp',
              'If you started or stopped the timer late, adjust the times before saving.'
            )}
          </p>
          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="fast-end-start-time">
              {t('fasting.startTime', 'Start time')}
            </Label>
            <Input
              id="fast-end-start-time"
              type="datetime-local"
              dir="ltr"
              value={startLocal}
              onChange={(e) => {
                setStartLocal(e.target.value);
                setTimeError('');
              }}
            />
            <Label htmlFor="fast-end-time">
              {t('fasting.endTime', 'End time')}
            </Label>
            <Input
              id="fast-end-time"
              type="datetime-local"
              dir="ltr"
              value={endLocal}
              onChange={(e) => {
                setEndLocal(e.target.value);
                setTimeError('');
              }}
            />
          </div>
          {timeError && (
            <p role="alert" className="text-sm text-destructive">
              {timeError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('fasting.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={handleConfirm}>
            {t('fasting.confirmEnd', 'End and save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EndFastDialog;
