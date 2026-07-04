import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCycleHistory,
  useCreateManualCycleMutation,
  useUpdateCycleMutation,
  useDeleteCycleMutation,
} from '@/hooks/useCycle';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit, Trash, HelpCircle } from 'lucide-react';
import CycleBarGlyph from './CycleBarGlyph';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { SharedCycle } from '@workspace/shared';

export default function CycleHistoryList() {
  const { t } = useTranslation();
  const { data: cycles = [] } = useCycleHistory();

  // Mutation Hooks
  const createMutation = useCreateManualCycleMutation();
  const updateMutation = useUpdateCycleMutation();
  const deleteMutation = useDeleteCycleMutation();

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [activeCycle, setActiveCycle] = useState<SharedCycle | null>(null);

  // Form states
  const [startDate, setStartDate] = useState('');
  const [periodLength, setPeriodLength] = useState(5);
  const [cycleLength, setCycleLength] = useState(28);
  const [isExcluded, setIsExcluded] = useState(false);

  const handleAddCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate) return;
    try {
      await createMutation.mutateAsync({
        start_date: startDate,
        period_length: periodLength || null,
        cycle_length: cycleLength || null,
        is_excluded: isExcluded,
      });
      toast({
        title: t('cycle.history.addSuccess', 'Cycle added'),
        description: t(
          'cycle.history.addSuccessDesc',
          'Successfully logged manual cycle history.'
        ),
      });
      setIsAddOpen(false);
      setStartDate('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartEdit = (cycle: SharedCycle) => {
    setActiveCycle(cycle);
    setStartDate(cycle.start_date);
    setPeriodLength(cycle.period_length ?? 5);
    setCycleLength(cycle.cycle_length ?? 28);
    setIsExcluded(cycle.is_excluded ?? false);
    setIsEditOpen(true);
  };

  const handleUpdateCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCycle || !startDate) return;
    try {
      await updateMutation.mutateAsync({
        id: activeCycle.id!,
        body: {
          start_date: startDate,
          period_length: periodLength || null,
          cycle_length: cycleLength || null,
          is_excluded: isExcluded,
        },
      });
      toast({
        title: t('cycle.history.updateSuccess', 'Cycle updated'),
        description: t(
          'cycle.history.updateSuccessDesc',
          'Successfully updated manual cycle dates.'
        ),
      });
      setIsEditOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCycle = async (id: string) => {
    if (
      !confirm(
        t(
          'cycle.history.confirmDelete',
          'Are you sure you want to delete this cycle record?'
        )
      )
    )
      return;
    try {
      await deleteMutation.mutateAsync(id);
      toast({
        title: t('cycle.history.deleteSuccess', 'Cycle deleted'),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleExclude = async (cycle: SharedCycle) => {
    try {
      await updateMutation.mutateAsync({
        id: cycle.id!,
        body: {
          is_excluded: !cycle.is_excluded,
        },
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Log button */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm">
              {t('cycle.history.title', 'Cycle History')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                'cycle.history.desc',
                'View and adjust your past period dates and statistics.'
              )}
            </p>
          </div>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8">
                <Plus className="h-4 w-4 mr-1" />{' '}
                {t('cycle.history.logPrevious', 'Log Previous Period')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>
                  {t('cycle.history.logPreviousTitle', 'Log Previous Period')}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    'cycle.history.logPreviousDesc',
                    'Enter past menstrual period dates to seed calculations.'
                  )}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddCycle} className="space-y-4 pt-2">
                <div className="space-y-1">
                  <Label htmlFor="start-date">
                    {t('cycle.history.startDate', 'Start Date')}
                  </Label>
                  <Input
                    type="date"
                    id="start-date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="period-len">
                    {t('cycle.history.periodLength', 'Period Length (days)')}
                  </Label>
                  <Input
                    type="number"
                    id="period-len"
                    min={1}
                    max={15}
                    value={periodLength}
                    onChange={(e) => setPeriodLength(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cycle-len">
                    {t('cycle.history.cycleLength', 'Cycle Length (days)')}
                  </Label>
                  <Input
                    type="number"
                    id="cycle-len"
                    min={15}
                    max={90}
                    value={cycleLength}
                    onChange={(e) => setCycleLength(Number(e.target.value))}
                  />
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <Label htmlFor="exclude-toggle" className="flex flex-col">
                    <span>
                      {t('cycle.history.exclude', 'Exclude from stats')}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {t(
                        'cycle.history.excludeHelp',
                        'Use for irregular outliers'
                      )}
                    </span>
                  </Label>
                  <Switch
                    id="exclude-toggle"
                    checked={isExcluded}
                    onCheckedChange={setIsExcluded}
                  />
                </div>
                <Button type="submit" className="w-full">
                  {t('common.save', 'Save')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* History table list */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {cycles.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-6">
              {t(
                'cycle.history.noCycles',
                'No cycles recorded yet. Try logging your period.'
              )}
            </p>
          ) : (
            <div className="space-y-4 divide-y">
              {cycles.map((cycle) => {
                const isManual = cycle.source === 'manual';
                return (
                  <div
                    key={cycle.id}
                    className={cn(
                      'pt-4 first:pt-0 flex flex-col gap-2',
                      cycle.is_excluded && 'opacity-65'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold">
                          {new Date(cycle.start_date).toLocaleDateString(
                            t('i18n.locale', 'en-US'),
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              timeZone: 'UTC',
                            }
                          )}
                        </span>
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded ml-2 text-muted-foreground select-none">
                          {isManual
                            ? t('cycle.history.manual', 'Manual')
                            : t('cycle.history.derived', 'Auto')}
                        </span>
                        {cycle.is_excluded && (
                          <span className="text-[10px] bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-950/30 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded ml-2 font-medium">
                            {t('cycle.history.excluded', 'Excluded')}
                          </span>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          title={t(
                            'cycle.history.excludeToggle',
                            'Toggle exclude'
                          )}
                          onClick={() => handleToggleExclude(cycle)}
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={() => handleStartEdit(cycle)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() =>
                            cycle.id && handleDeleteCycle(cycle.id)
                          }
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Timeline bar glyph */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <CycleBarGlyph
                          cycleLength={cycle.cycle_length ?? 28}
                          periodLength={cycle.period_length ?? 5}
                        />
                      </div>
                      <div className="text-[11px] text-muted-foreground shrink-0 min-w-[70px] text-right font-medium">
                        <span>
                          {cycle.cycle_length
                            ? `${cycle.cycle_length}d cycle`
                            : '—'}
                        </span>
                        <span className="block text-[9px] opacity-75">
                          {cycle.period_length
                            ? `${cycle.period_length}d period`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t('cycle.history.editTitle', 'Edit Cycle Record')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'cycle.history.editDesc',
                'Edit cycle start/end dates or parameters.'
              )}
            </DialogDescription>
          </DialogHeader>
          {activeCycle && (
            <form onSubmit={handleUpdateCycle} className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label htmlFor="edit-start-date">
                  {t('cycle.history.startDate', 'Start Date')}
                </Label>
                <Input
                  type="date"
                  id="edit-start-date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-period-len">
                  {t('cycle.history.periodLength', 'Period Length (days)')}
                </Label>
                <Input
                  type="number"
                  id="edit-period-len"
                  min={1}
                  max={15}
                  value={periodLength}
                  onChange={(e) => setPeriodLength(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-cycle-len">
                  {t('cycle.history.cycleLength', 'Cycle Length (days)')}
                </Label>
                <Input
                  type="number"
                  id="edit-cycle-len"
                  min={15}
                  max={90}
                  value={cycleLength}
                  onChange={(e) => setCycleLength(Number(e.target.value))}
                />
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <Label htmlFor="edit-exclude-toggle" className="flex flex-col">
                  <span>
                    {t('cycle.history.exclude', 'Exclude from stats')}
                  </span>
                </Label>
                <Switch
                  id="edit-exclude-toggle"
                  checked={isExcluded}
                  onCheckedChange={setIsExcluded}
                />
              </div>
              <Button type="submit" className="w-full">
                {t('common.save', 'Save')}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
