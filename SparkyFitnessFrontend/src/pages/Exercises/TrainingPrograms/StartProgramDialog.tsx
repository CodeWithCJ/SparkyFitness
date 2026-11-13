import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface StartProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programName: string;
  /** Today, YYYY-MM-DD, in the user's timezone. */
  today: string;
  /** Called with null for today, or the picked day. */
  onStart: (startDay: string | null) => void;
}

/** Asks when the first workout is: today, or a later date. */
const StartProgramDialog = ({
  open,
  onOpenChange,
  programName,
  today,
  onStart,
}: StartProgramDialogProps) => {
  const { t } = useTranslation();
  const [pickedDay, setPickedDay] = useState('');
  const later = pickedDay > today;

  const start = (startDay: string | null) => {
    onStart(startDay);
    setPickedDay('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('trainingPrograms.start.title', 'Start {{name}}', {
              name: programName,
            })}
          </DialogTitle>
          <DialogDescription>
            {t('trainingPrograms.start.message', 'When is your first workout?')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="training-program-start-date">
            {t('trainingPrograms.start.pickDate', 'Pick a date')}
          </Label>
          <Input
            id="training-program-start-date"
            type="date"
            min={today}
            value={pickedDay}
            onChange={(e) => setPickedDay(e.target.value)}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="outline"
            disabled={!later}
            onClick={() => start(pickedDay)}
          >
            {t('trainingPrograms.start.startOnDate', 'Start on that date')}
          </Button>
          <Button onClick={() => start(null)}>
            {t('trainingPrograms.start.today', 'Start today')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StartProgramDialog;
