import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useMedicationTitration,
  useAddTitrationStepMutation,
  useUpdateTitrationStepMutation,
  useDeleteTitrationStepMutation,
} from '@/hooks/useMedications';
import type { Medication, TitrationStep } from '@/types/medications';

interface Glp1TitrationManagerProps {
  med: Medication;
}

export default function Glp1TitrationManager({
  med,
}: Glp1TitrationManagerProps) {
  const { t } = useTranslation();
  const medId = med.id;

  const titrationQ = useMedicationTitration(medId);
  const addStepMutation = useAddTitrationStepMutation(medId);
  const updateStepMutation = useUpdateTitrationStepMutation(medId);
  const deleteStepMutation = useDeleteTitrationStepMutation(medId);

  const [showAddStep, setShowAddStep] = useState(false);
  const [editingStep, setEditingStep] = useState<TitrationStep | null>(null);
  const [stepDose, setStepDose] = useState('');
  const [stepUnit, setStepUnit] = useState('mg');
  const [stepStart, setStepStart] = useState('');
  const [stepWeeks, setStepWeeks] = useState('');
  const [stepStatus, setStepStatus] = useState<'planned' | 'active' | 'done'>(
    'planned'
  );
  const [stepIsTaper, setStepIsTaper] = useState(false);

  const resetForm = () => {
    setShowAddStep(false);
    setEditingStep(null);
    setStepDose('');
    setStepUnit('mg');
    setStepStart('');
    setStepWeeks('');
    setStepStatus('planned');
    setStepIsTaper(false);
  };

  const openEditStep = (step: TitrationStep) => {
    setEditingStep(step);
    setStepDose(String(step.dose_mg));
    setStepUnit(step.dose_unit || 'mg');
    setStepStart(step.start_date ?? '');
    setStepWeeks(step.planned_weeks != null ? String(step.planned_weeks) : '');
    setStepStatus(step.status);
    setStepIsTaper(step.is_taper);
    setShowAddStep(true);
  };

  const handleSaveStep = () => {
    if (!stepDose) return;
    const body = {
      dose_mg: Number(stepDose),
      dose_unit: stepUnit || 'mg',
      start_date: stepStart || null,
      planned_weeks: stepWeeks ? Number(stepWeeks) : null,
      status: stepStatus,
      is_taper: stepIsTaper,
    };
    if (editingStep) {
      updateStepMutation.mutate(
        { id: editingStep.id, body },
        { onSuccess: resetForm }
      );
    } else {
      addStepMutation.mutate(body, { onSuccess: resetForm });
    }
  };

  const savePending = addStepMutation.isPending || updateStepMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {t('medications.glp1.titrationTitle', 'Dose titration plan')}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => (showAddStep ? resetForm() : setShowAddStep(true))}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />{' '}
            {t('medications.glp1.addStep', 'Add step')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Your planned GLP-1 dose escalation (e.g. 0.25 → 0.5 → 1.0 mg). Add
          each step with its start date; mark one “active” as your current dose.
        </p>
      </CardHeader>
      <CardContent>
        {showAddStep && (
          <div className="mb-4 space-y-2 rounded-md border p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Dose</Label>
                <div className="flex gap-1">
                  <Input
                    type="number"
                    step="0.05"
                    value={stepDose}
                    onChange={(e) => setStepDose(e.target.value)}
                    placeholder="1.0"
                  />
                  <Input
                    className="w-16"
                    value={stepUnit}
                    onChange={(e) => setStepUnit(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Start date
                </Label>
                <Input
                  type="date"
                  value={stepStart}
                  onChange={(e) => setStepStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Weeks at this dose
                </Label>
                <Input
                  type="number"
                  value={stepWeeks}
                  onChange={(e) => setStepWeeks(e.target.value)}
                  placeholder="4"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select
                  value={stepStatus}
                  onValueChange={(v) =>
                    setStepStatus(v as 'planned' | 'active' | 'done')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">
                      {t('medications.glp1.statusPlanned', 'Planned')}
                    </SelectItem>
                    <SelectItem value="active">
                      {t('medications.glp1.statusActive', 'Active (current)')}
                    </SelectItem>
                    <SelectItem value="done">
                      {t('medications.glp1.statusDone', 'Done')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={stepIsTaper}
                  onCheckedChange={setStepIsTaper}
                />{' '}
                Taper (dose reduction)
              </label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveStep}
                  disabled={!stepDose || savePending}
                >
                  {editingStep ? 'Save' : 'Add'}
                </Button>
              </div>
            </div>
          </div>
        )}
        {(titrationQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'medications.glp1.noTitration',
              'No titration steps yet — tap “Add step” to plan your dose escalation.'
            )}
          </p>
        ) : (
          <ol className="relative space-y-4 border-l border-muted pl-6">
            {(titrationQ.data ?? []).map((step) => {
              const active = step.status === 'active';
              const done = step.status === 'done';
              return (
                <li key={step.id} className="relative">
                  <span
                    className={`absolute -left-[27px] mt-1 h-3.5 w-3.5 rounded-full border-2 ${
                      active
                        ? 'border-blue-500 bg-blue-500'
                        : done
                          ? 'border-green-500 bg-green-500'
                          : 'border-muted-foreground/40 bg-background'
                    }`}
                  />
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">
                        {step.dose_mg} {step.dose_unit}
                      </span>
                      {step.start_date && (
                        <span className="text-muted-foreground">
                          {' '}
                          · {step.start_date}
                        </span>
                      )}
                      {step.planned_weeks ? (
                        <span className="text-muted-foreground">
                          {' '}
                          · {step.planned_weeks} wks
                        </span>
                      ) : null}
                      {step.is_taper && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          taper
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={active ? 'default' : 'secondary'}
                        className="capitalize"
                      >
                        {step.status}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground"
                        onClick={() => openEditStep(step)}
                        aria-label="Edit titration step"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteStepMutation.mutate(step.id)}
                        aria-label="Delete titration step"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
