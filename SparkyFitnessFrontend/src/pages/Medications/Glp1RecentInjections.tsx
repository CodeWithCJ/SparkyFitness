import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';
import {
  INJECTION_SITES,
  localDateTimeToUtc,
  utcToLocalDateTimeInput,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useMedicationInjections,
  useUpdateInjectionMutation,
  useDeleteInjectionMutation,
} from '@/hooks/useMedications';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { Medication, InjectionEntry } from '@/types/medications';

interface Glp1RecentInjectionsProps {
  med: Medication;
}

export default function Glp1RecentInjections({
  med,
}: Glp1RecentInjectionsProps) {
  const { t } = useTranslation();
  const { formatDate, timezone } = usePreferences();
  const medId = med.id;

  const injQ = useMedicationInjections(medId);
  const updateInjMutation = useUpdateInjectionMutation(medId);
  const deleteInjMutation = useDeleteInjectionMutation(medId);

  const [editingInj, setEditingInj] = useState<InjectionEntry | null>(null);
  const [editSite, setEditSite] = useState('');
  const [editDoseMg, setEditDoseMg] = useState('');
  const [editInjectedAt, setEditInjectedAt] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const openEdit = (inj: InjectionEntry) => {
    setEditingInj(inj);
    setEditSite(inj.site ?? 'none');
    setEditDoseMg(inj.dose_mg != null ? String(inj.dose_mg) : '');
    setEditInjectedAt(utcToLocalDateTimeInput(inj.injected_at, timezone));
    setEditNotes(inj.notes ?? '');
  };

  const handleSaveEdit = () => {
    if (!editingInj) return;
    updateInjMutation.mutate(
      {
        id: editingInj.id,
        body: {
          site: editSite === 'none' ? null : editSite,
          dose_mg: editDoseMg ? Number(editDoseMg) : null,
          ...(editInjectedAt
            ? {
                injected_at: localDateTimeToUtc(
                  editInjectedAt,
                  timezone
                ).toISOString(),
                // Keep the calendar day in step with the edited local time.
                entry_date: editInjectedAt.substring(0, 10),
              }
            : {}),
          notes: editNotes.trim() || null,
        },
      },
      { onSuccess: () => setEditingInj(null) }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t('medications.glp1.recentInjections', 'Recent injections')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(injQ.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('medications.glp1.noInjections', 'No injections logged yet.')}
          </p>
        )}
        {(injQ.data ?? []).slice(0, 8).map((inj) => (
          <div
            key={inj.id}
            className="flex items-center justify-between rounded-md border p-2 text-sm gap-2"
          >
            <div className="flex flex-col min-w-0">
              <span className="font-medium truncate">
                {INJECTION_SITES.find((s) => s.id === inj.site)?.label ??
                  inj.site ??
                  '—'}
              </span>
              <span className="text-xs text-muted-foreground">
                {inj.dose_mg ? `${inj.dose_mg} mg · ` : ''}
                {formatDate(inj.injected_at)}
              </span>
              {inj.notes && (
                <span className="text-xs text-muted-foreground italic mt-0.5 block truncate">
                  Note: {inj.notes}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => openEdit(inj)}
                aria-label="Edit injection entry"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => deleteInjMutation.mutate(inj.id)}
                disabled={deleteInjMutation.isPending}
                aria-label="Delete injection entry"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      {/* Edit Injection Dialog */}
      <Dialog
        open={!!editingInj}
        onOpenChange={(open) => !open && setEditingInj(null)}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('medications.glp1.editInjection', 'Edit injection')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {t('medications.glp1.doseMg', 'Dose (mg)')}
                </Label>
                <Input
                  type="number"
                  step="0.05"
                  value={editDoseMg}
                  onChange={(e) => setEditDoseMg(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {t('medications.glp1.dateTime', 'Date & time')}
                </Label>
                <Input
                  type="datetime-local"
                  value={editInjectedAt}
                  onChange={(e) => setEditInjectedAt(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t('medications.glp1.injectionSite', 'Injection site')}
              </Label>
              <Select value={editSite} onValueChange={setEditSite}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {INJECTION_SITES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {t('medications.sites.label.' + s.id, s.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t('medications.glp1.notes', 'Notes')}
              </Label>
              <Input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingInj(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateInjMutation.isPending}
            >
              {updateInjMutation.isPending
                ? t('common.saving', 'Saving...')
                : t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
