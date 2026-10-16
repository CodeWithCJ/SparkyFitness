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

import { Trans, useTranslation } from 'react-i18next';
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
    } catch (e) {
      // ignore
    }
  }, [initialStartISO, initialEndISO, isOpen]);

  const handleConfirm = () => {
    // Convert local datetime-local value back to a Date object in user's local timezone
    const start = startLocal ? new Date(startLocal) : new Date();
    const end = endLocal ? new Date(endLocal) : new Date();
    onEnd(start, end);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('fasting.endFastDialog.fastCompleted', 'Fast Completed! 🎉')}
          </DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="fasting.endFastDialog.youFastedFor2"
              defaults={'You fasted for <span>{{durationFormatted}}</span>.'}
              values={{ durationFormatted }}
              components={{ span: <span className="font-bold text-primary" /> }}
            />
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <p className="text-muted-foreground text-center">
            {t(
              'fasting.endFastDialog.greatJobYouCanEdit',
              'Great job! You can edit the start/end times below if you missed pressing the buttons.'
            )}
          </p>
          <div className="grid grid-cols-1 gap-2">
            <label className="text-sm">
              {t('fasting.endFastDialog.startTime', 'Start Time')}
            </label>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="w-full p-2 border rounded"
            />
            <label className="text-sm">
              {t('fasting.endFastDialog.endTime', 'End Time')}
            </label>
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              className="w-full p-2 border rounded"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleConfirm}>
            {t('fasting.endFastDialog.endFast', 'End Fast')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EndFastDialog;
