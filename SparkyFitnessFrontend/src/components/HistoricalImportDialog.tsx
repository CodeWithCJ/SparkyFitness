import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Calendar, Clock } from "lucide-react";

interface HistoricalImportDialogProps {
  open: boolean;
  onClose: () => void;
  onStart: (startDate: string, endDate: string, skipExisting: boolean) => Promise<boolean>;
  loading?: boolean;
}

const HistoricalImportDialog: React.FC<HistoricalImportDialogProps> = ({
  open,
  onClose,
  onStart,
  loading = false,
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState(today);
  const [skipExisting, setSkipExisting] = useState(true);

  const presets = [
    { label: 'Last Year', days: 365 },
    { label: 'Last 2 Years', days: 730 },
    { label: 'Last 5 Years', days: 1825 },
  ];

  const applyPreset = (days: number) => {
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(today);
  };

  const calculateEstimate = () => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const chunks = Math.ceil(days / 7);
    const minutes = Math.ceil(chunks * 0.5);
    return { days, chunks, minutes };
  };

  const estimate = calculateEstimate();

  const handleStart = async () => {
    if (startDate && endDate) {
      const success = await onStart(startDate, endDate, skipExisting);
      if (success) {
        onClose(); // Close dialog, toast will show status
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Historical Import
          </DialogTitle>
          <DialogDescription>
            Import your Garmin data from a specific date range. This may take several minutes for large ranges.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.days}
                variant="outline"
                size="sm"
                onClick={() => applyPreset(preset.days)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={endDate || today}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                max={today}
                min={startDate}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="skip-existing" className="text-sm font-medium">
                Skip existing data
              </Label>
              <p className="text-xs text-muted-foreground">
                {skipExisting
                  ? "Only import days without existing data"
                  : "Re-import all data (replaces existing)"}
              </p>
            </div>
            <Switch
              id="skip-existing"
              checked={skipExisting}
              onCheckedChange={setSkipExisting}
            />
          </div>

          {estimate && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-lg">
              <Clock className="h-4 w-4" />
              <span>
                {estimate.days} days ({estimate.chunks} chunks) -
                approximately {estimate.minutes} {estimate.minutes === 1 ? 'minute' : 'minutes'}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            disabled={!startDate || !endDate || loading}
          >
            {loading ? 'Starting...' : 'Start Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HistoricalImportDialog;
