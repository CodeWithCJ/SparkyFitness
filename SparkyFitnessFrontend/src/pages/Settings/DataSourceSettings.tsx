import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Database, Save } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

const SLEEP_SOURCES = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'garmin', label: 'Garmin' },
  { value: 'withings', label: 'Withings' },
  { value: 'fitbit', label: 'Fitbit' },
  { value: 'polar', label: 'Polar' },
  { value: 'healthkit', label: 'Apple Health' },
  { value: 'health_connect', label: 'Health Connect' },
  { value: 'manual', label: 'Manual' },
];

const BODY_SOURCES = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'withings', label: 'Withings' },
  { value: 'garmin', label: 'Garmin' },
  { value: 'fitbit', label: 'Fitbit' },
  { value: 'healthkit', label: 'Apple Health' },
  { value: 'health_connect', label: 'Health Connect' },
  { value: 'manual', label: 'Manual' },
];

const ACTIVITY_SOURCES = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'garmin', label: 'Garmin' },
  { value: 'fitbit', label: 'Fitbit' },
  { value: 'polar', label: 'Polar' },
  { value: 'healthkit', label: 'Apple Health' },
  { value: 'health_connect', label: 'Health Connect' },
  { value: 'manual', label: 'Manual' },
];

export const DataSourceSettings = () => {
  const { user } = useAuth();
  const {
    sleepSourcePreference,
    bodySourcePreference,
    activitySourcePreference,
    saveAllPreferences,
  } = usePreferences();

  const [localSleep, setLocalSleep] = useState(sleepSourcePreference);
  const [localBody, setLocalBody] = useState(bodySourcePreference);
  const [localActivity, setLocalActivity] = useState(activitySourcePreference);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await saveAllPreferences({
        sleepSourcePreference: localSleep,
        bodySourcePreference: localBody,
        activitySourcePreference: localActivity,
      });
      toast({
        title: 'Data source preferences saved',
        description: 'Your preferred sources will be used going forward.',
      });
    } catch (err) {
      console.error('Error saving data source preferences:', err);
      toast({
        title: 'Failed to save preferences',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AccordionItem value="data-sources" className="border rounded-lg mb-4">
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description="Choose which integration to use as the primary source per data category"
      >
        <Database className="h-5 w-5" />
        Data Source Priority
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0">
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            When multiple integrations report data for the same day,{' '}
            <strong>Auto</strong> picks the highest-quality source
            automatically. Override this per category if you always prefer a
            specific device.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Sleep */}
            <div className="space-y-2">
              <Label htmlFor="sleep-source">Sleep</Label>
              <p className="text-xs text-muted-foreground">
                Duration, stages, HRV, SpO₂
              </p>
              <Select value={localSleep} onValueChange={setLocalSleep}>
                <SelectTrigger id="sleep-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLEEP_SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Body & weight */}
            <div className="space-y-2">
              <Label htmlFor="body-source">Body &amp; Weight</Label>
              <p className="text-xs text-muted-foreground">
                Weight, BMI, body fat, muscle mass
              </p>
              <Select value={localBody} onValueChange={setLocalBody}>
                <SelectTrigger id="body-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BODY_SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Daily activity */}
            <div className="space-y-2">
              <Label htmlFor="activity-source">Daily Activity</Label>
              <p className="text-xs text-muted-foreground">
                Steps, distance, active calories
              </p>
              <Select value={localActivity} onValueChange={setLocalActivity}>
                <SelectTrigger id="activity-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Workouts — always union, no preference needed */}
            <div className="space-y-2">
              <Label>Workouts</Label>
              <p className="text-xs text-muted-foreground">
                Exercise sessions, activities
              </p>
              <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm text-muted-foreground">
                All sources merged automatically
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={loading} className="gap-2">
            <Save className="h-4 w-4" />
            {loading ? 'Saving…' : 'Save preferences'}
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
