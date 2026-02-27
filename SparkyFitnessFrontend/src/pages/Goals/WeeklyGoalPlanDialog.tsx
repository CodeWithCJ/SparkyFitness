import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarDays } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import {
  useCreateWeeklyPlanMutation,
  useUpdateWeeklyPlanMutation,
} from '@/hooks/Goals/useGoals';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import { DEFAULT_PLAN } from '@/constants/goals';
import { WeeklyGoalPlan, GoalPreset } from '@/types/goals';

const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
type DayPresetKey = `${(typeof DAYS_OF_WEEK)[number]}_preset_id`;
interface WeeklyGoalPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: WeeklyGoalPlan | null;
  goalPresets: GoalPreset[];
}

export const WeeklyGoalPlanDialog = ({
  open,
  onOpenChange,
  plan,
  goalPresets,
}: WeeklyGoalPlanDialogProps) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const { dateFormat, formatDateInUserTimezone, parseDateInUserTimezone } =
    usePreferences();
  const { mutateAsync: createWeeklyGoalPlan } = useCreateWeeklyPlanMutation();
  const { mutateAsync: updateWeeklyGoalPlan } = useUpdateWeeklyPlanMutation();
  const [currentWeeklyPlan, setCurrentWeeklyPlan] =
    useState<WeeklyGoalPlan | null>(null);

  useEffect(() => {
    if (open) {
      if (plan) {
        setCurrentWeeklyPlan({ ...plan });
      } else {
        setCurrentWeeklyPlan({
          ...DEFAULT_PLAN,
          start_date: new Date().toISOString().split('T')[0],
        } as WeeklyGoalPlan);
      }
    }
  }, [open, plan]);

  const handleSaveWeeklyPlan = async () => {
    if (!currentWeeklyPlan || !user) return;

    setIsSaving(true);
    try {
      if (currentWeeklyPlan.id) {
        await updateWeeklyGoalPlan({
          id: currentWeeklyPlan.id,
          data: currentWeeklyPlan,
        });
      } else {
        await createWeeklyGoalPlan(currentWeeklyPlan);
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save weekly plan:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {currentWeeklyPlan?.id
              ? t(
                  'goals.goalsSettings.editWeeklyGoalPlan',
                  'Edit Weekly Goal Plan'
                )
              : t(
                  'goals.goalsSettings.createNewWeeklyGoalPlan',
                  'Create New Weekly Goal Plan'
                )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'goals.goalsSettings.defineWeeklySchedule',
              'Define a recurring weekly schedule for your goals.'
            )}
          </DialogDescription>
        </DialogHeader>
        {currentWeeklyPlan && (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="plan_name" className="text-right">
                {t('goals.goalsSettings.planName', 'Plan Name')}
              </Label>
              <Input
                id="plan_name"
                value={currentWeeklyPlan.plan_name}
                onChange={(e) =>
                  setCurrentWeeklyPlan({
                    ...currentWeeklyPlan,
                    plan_name: e.target.value,
                  })
                }
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="start_date" className="text-right">
                {t('goals.goalsSettings.startDate', 'Start Date')}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={'outline'}
                    className={cn(
                      'col-span-3 justify-start text-left font-normal',
                      !currentWeeklyPlan.start_date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {currentWeeklyPlan.start_date ? (
                      formatDateInUserTimezone(
                        new Date(currentWeeklyPlan.start_date),
                        dateFormat
                      )
                    ) : (
                      <span>
                        {t('goals.goalsSettings.pickADate', 'Pick a date')}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={parseDateInUserTimezone(
                      currentWeeklyPlan.start_date
                    )} // Changed
                    onSelect={(date) =>
                      setCurrentWeeklyPlan({
                        ...currentWeeklyPlan,
                        start_date: formatDateInUserTimezone(
                          date!,
                          'yyyy-MM-dd'
                        ),
                      })
                    }
                    yearsRange={10}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="end_date" className="text-right">
                {t('goals.goalsSettings.endDate', 'End Date (Optional)')}
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={'outline'}
                    className={cn(
                      'col-span-3 justify-start text-left font-normal',
                      !currentWeeklyPlan.end_date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {currentWeeklyPlan.end_date ? (
                      formatDateInUserTimezone(
                        parseDateInUserTimezone(currentWeeklyPlan.end_date),
                        dateFormat
                      )
                    ) : (
                      <span>
                        {t('goals.goalsSettings.pickADate', 'Pick a date')}
                      </span>
                    )}{' '}
                    // Changed
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={
                      currentWeeklyPlan.end_date
                        ? parseDateInUserTimezone(currentWeeklyPlan.end_date)
                        : undefined
                    } // Changed
                    onSelect={(date) =>
                      setCurrentWeeklyPlan({
                        ...currentWeeklyPlan,
                        end_date: date
                          ? formatDateInUserTimezone(date, 'yyyy-MM-dd')
                          : null,
                      })
                    }
                    yearsRange={10}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="is_active" className="text-right">
                {t('goals.goalsSettings.activePlan', 'Active Plan')}
              </Label>
              <RadioGroup
                value={currentWeeklyPlan.is_active ? 'true' : 'false'}
                onValueChange={(value) =>
                  setCurrentWeeklyPlan({
                    ...currentWeeklyPlan,
                    is_active: value === 'true',
                  })
                }
                className="flex items-center space-x-4 col-span-3"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="true" id="active-true" />
                  <Label htmlFor="active-true">
                    {t('goals.goalsSettings.yes', 'Yes')}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="false" id="active-false" />
                  <Label htmlFor="active-false">
                    {t('goals.goalsSettings.no', 'No')}
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Day of Week Preset Selection */}
            {DAYS_OF_WEEK.map((day) => {
              const presetKey = `${day}_preset_id` as DayPresetKey;
              return (
                <div className="grid grid-cols-4 items-center gap-4" key={day}>
                  <Label htmlFor={presetKey} className="text-right capitalize">
                    {t(
                      `common.${day}`,
                      day.charAt(0).toUpperCase() + day.slice(1)
                    )}
                  </Label>
                  <Select
                    value={
                      (currentWeeklyPlan[presetKey] as string) || undefined
                    }
                    onValueChange={(value) =>
                      setCurrentWeeklyPlan({
                        ...currentWeeklyPlan,
                        [presetKey]: value || null,
                      })
                    }
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue
                        placeholder={t('goals.goalsSettings.selectPreset', {
                          day: t(`common.${day}`, day),
                          defaultValue: 'Select preset',
                        })}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {goalPresets
                        .filter((p) => p.id)
                        .map((preset) => {
                          return (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.preset_name}
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button onClick={handleSaveWeeklyPlan} disabled={isSaving}>
            {isSaving
              ? t('goals.goalsSettings.saving', 'Saving...')
              : t('goals.goalsSettings.saveWeeklyPlan', 'Save Weekly Plan')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
