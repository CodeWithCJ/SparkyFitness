import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FastingLog } from '@/types/fasting';
import { FASTING_PRESETS } from '@/constants/fastingPresets';

interface EditFastDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fast: FastingLog | null;
  onSave: (updates: {
    id: string;
    updates: Partial<FastingLog>;
  }) => Promise<unknown>;
}

export const EditFastDialog: React.FC<EditFastDialogProps> = ({
  isOpen,
  onClose,
  fast,
  onSave,
}) => {
  const { t } = useTranslation();

  const formatForLocalInput = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [targetEndTime, setTargetEndTime] = useState('');
  const [fastingType, setFastingType] = useState('');
  const [presetId, setPresetId] = useState('');
  const [isCustomPreset, setIsCustomPreset] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (fast) {
      setError('');
      setStartTime(formatForLocalInput(new Date(fast.start_time)));
      setEndTime(
        fast.end_time ? formatForLocalInput(new Date(fast.end_time)) : ''
      );
      setTargetEndTime(
        fast.target_end_time
          ? formatForLocalInput(new Date(fast.target_end_time))
          : ''
      );
      setFastingType(fast.fasting_type || '');

      const foundPreset = FASTING_PRESETS.find(
        (p) => p.name === fast.fasting_type
      );
      if (foundPreset) {
        setPresetId(foundPreset.id);
        setIsCustomPreset(false);
      } else {
        setPresetId('custom');
        setIsCustomPreset(true);
      }
    }
  }, [fast, isOpen]);

  const handlePresetChange = (value: string) => {
    setPresetId(value);
    if (value === 'custom') {
      setIsCustomPreset(true);
    } else {
      setIsCustomPreset(false);
      const preset = FASTING_PRESETS.find((p) => p.id === value);
      if (preset) {
        setFastingType(preset.name);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fast) return;
    setError('');

    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : null;
    const targetEnd = targetEndTime ? new Date(targetEndTime) : null;

    if (end && start > end) {
      setError(
        t('fasting.errorStartAfterEnd', 'Start time must be before end time.')
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const updates: Partial<FastingLog> = {
        start_time: start.toISOString(),
        end_time: end ? end.toISOString() : null,
        target_end_time: targetEnd ? targetEnd.toISOString() : null,
        fasting_type: fastingType,
      };

      await onSave({ id: fast.id, updates });
      onClose();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || t('fasting.failedToUpdate', 'Failed to update fast.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('fasting.editFastTitle', 'Edit Fast')}</DialogTitle>
            <DialogDescription>
              {t(
                'fasting.editFastDesc',
                'Modify the fasting log details below.'
              )}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div className="grid gap-1">
              <Label htmlFor="preset-select">
                {t('fasting.protocol', 'Protocol')}
              </Label>
              <Select value={presetId} onValueChange={handlePresetChange}>
                <SelectTrigger id="preset-select">
                  <SelectValue
                    placeholder={t('fasting.selectProtocol', 'Select Protocol')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {FASTING_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isCustomPreset && (
              <div className="grid gap-1">
                <Label htmlFor="custom-protocol-name">
                  {t('fasting.protocolName', 'Protocol Name')}
                </Label>
                <Input
                  id="custom-protocol-name"
                  value={fastingType}
                  onChange={(e) => setFastingType(e.target.value)}
                  placeholder={t(
                    'fasting.protocolNamePlaceholder',
                    'Enter custom protocol name'
                  )}
                  required
                />
              </div>
            )}

            <div className="grid gap-1">
              <Label htmlFor="start-time">
                {t('fasting.startTime', 'Start Time')}
              </Label>
              <Input
                id="start-time"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>

            {fast?.status === 'COMPLETED' ? (
              <div className="grid gap-1">
                <Label htmlFor="end-time">
                  {t('fasting.endTime', 'End Time')}
                </Label>
                <Input
                  id="end-time"
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
            ) : (
              <div className="grid gap-1">
                <Label htmlFor="target-end-time">
                  {t('fasting.targetEndTime', 'Target End Time')}
                </Label>
                <Input
                  id="target-end-time"
                  type="datetime-local"
                  value={targetEndTime}
                  onChange={(e) => setTargetEndTime(e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t('common.saving', 'Saving...')
                : t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditFastDialog;
