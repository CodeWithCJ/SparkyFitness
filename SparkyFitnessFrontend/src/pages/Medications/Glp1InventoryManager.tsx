import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { todayInZone, addDays } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
  useMedicationPens,
  useCreatePenMutation,
  useUpdatePenMutation,
  useDeletePenMutation,
} from '@/hooks/useMedications';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { Medication, MedicationPen } from '@/types/medications';

interface Glp1InventoryManagerProps {
  med: Medication;
}

export default function Glp1InventoryManager({
  med,
}: Glp1InventoryManagerProps) {
  const { t } = useTranslation();
  const medId = med.id;

  const pensQ = useMedicationPens(medId);
  const addPenMutation = useCreatePenMutation(medId);
  const updatePenMutation = useUpdatePenMutation(medId);
  const deletePenMutation = useDeletePenMutation(medId);

  // Add/Edit Inventory Form States
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [editingPen, setEditingPen] = useState<MedicationPen | null>(null);
  const [kind, setKind] = useState<'pen' | 'vial'>('pen');
  const [label, setLabel] = useState('');
  const [inventoryDoseMg, setInventoryDoseMg] = useState(
    med.dose_amount != null ? String(med.dose_amount) : ''
  );
  const [concentration, setConcentration] = useState('');
  const [volume, setVolume] = useState('');
  const [dosesTotal, setDosesTotal] = useState('4');
  const [openedAt, setOpenedAt] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [reorderFlag, setReorderFlag] = useState(false);
  const [reorderThreshold, setReorderThreshold] = useState('1');
  const [notes, setNotes] = useState('');

  const preferencesContext = usePreferences();
  const timezone =
    preferencesContext?.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayInZone(timezone);

  const calculatedBudDate = useMemo(() => {
    if (!openedAt) return '';
    try {
      return addDays(openedAt, 28);
    } catch {
      return '';
    }
  }, [openedAt]);

  const getExpiryStatus = (
    targetDateStr: string | null,
    currentDateStr: string
  ) => {
    if (!targetDateStr) return null;
    try {
      const target = new Date(targetDateStr + 'T00:00:00');
      const current = new Date(currentDateStr + 'T00:00:00');
      const diffDays =
        (target.getTime() - current.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < 0) return 'expired';
      if (diffDays <= 7) return 'near';
      return 'good';
    } catch {
      return null;
    }
  };

  const resetForm = () => {
    setEditingPen(null);
    setKind('pen');
    setLabel('');
    setInventoryDoseMg(med.dose_amount != null ? String(med.dose_amount) : '');
    setConcentration('');
    setVolume('');
    setDosesTotal('4');
    setOpenedAt('');
    setExpiryDate('');
    setReorderFlag(false);
    setReorderThreshold('1');
    setNotes('');
  };

  const openAddDialog = () => {
    resetForm();
    setInventoryOpen(true);
  };

  const openEditDialog = (pen: MedicationPen) => {
    setEditingPen(pen);
    setKind(pen.kind);
    setLabel(pen.label ?? '');
    setInventoryDoseMg(pen.dose_mg != null ? String(pen.dose_mg) : '');
    setConcentration(
      pen.concentration_mg_ml != null ? String(pen.concentration_mg_ml) : ''
    );
    setVolume(pen.volume_ml != null ? String(pen.volume_ml) : '');
    setDosesTotal(pen.doses_total != null ? String(pen.doses_total) : '');
    setOpenedAt(pen.opened_at ?? '');
    setExpiryDate(pen.expiry_date ?? '');
    setReorderFlag(pen.reorder_flag);
    setReorderThreshold(
      pen.reorder_threshold != null ? String(pen.reorder_threshold) : '1'
    );
    setNotes(pen.notes ?? '');
    setInventoryOpen(true);
  };

  const handleSaveInventory = () => {
    const body = {
      kind,
      label: label.trim() || null,
      dose_mg: inventoryDoseMg ? Number(inventoryDoseMg) : null,
      concentration_mg_ml:
        kind === 'vial' && concentration ? Number(concentration) : null,
      volume_ml: kind === 'vial' && volume ? Number(volume) : null,
      doses_total: dosesTotal ? Number(dosesTotal) : null,
      opened_at: openedAt || null,
      expiry_date: expiryDate || null,
      bud_date: calculatedBudDate || null,
      reorder_flag: reorderFlag,
      reorder_threshold:
        reorderFlag && reorderThreshold ? Number(reorderThreshold) : null,
      notes: notes.trim() || null,
    } as Partial<MedicationPen>;

    const onSuccess = () => {
      setInventoryOpen(false);
      resetForm();
    };

    if (editingPen) {
      // Preserve the pen's lifecycle status on edit, except sealed -> in_use
      // when an opened date is first set.
      if (editingPen.status === 'sealed' && openedAt) {
        body.status = 'in_use';
      }
      updatePenMutation.mutate({ id: editingPen.id, body }, { onSuccess });
    } else {
      body.status = openedAt ? 'in_use' : 'sealed';
      addPenMutation.mutate(body, { onSuccess });
    }
  };

  const savePending = addPenMutation.isPending || updatePenMutation.isPending;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>
              {t('medications.glp1.penInventory', 'Pen / vial inventory')}
            </span>
            <Button variant="outline" size="sm" onClick={openAddDialog}>
              {t('medications.glp1.addInventory', 'Add Inventory')}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(pensQ.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('medications.glp1.noPens', 'No pens/vials tracked.')}
            </p>
          )}
          {(pensQ.data ?? []).map((p) => {
            const total = p.doses_total ?? 0;
            const left = Math.max(0, total - p.doses_used);
            const pct = total > 0 ? Math.round((left / total) * 100) : 0;
            const low = total > 0 && pct <= 25;
            const expStatus = getExpiryStatus(p.expiry_date, today);
            const budStatus = getExpiryStatus(p.bud_date, today);

            return (
              <div key={p.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">{p.kind}</span>
                    {p.label && (
                      <span className="text-muted-foreground">({p.label})</span>
                    )}
                    {p.dose_mg ? (
                      <span className="text-muted-foreground">
                        {p.dose_mg} mg
                      </span>
                    ) : null}
                    {p.concentration_mg_ml ? (
                      <span className="text-muted-foreground">
                        · {p.concentration_mg_ml} mg/mL
                      </span>
                    ) : null}
                    {p.status === 'in_use' && (
                      <Badge variant="secondary" className="text-[10px]">
                        in use
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {p.reorder_flag &&
                      p.reorder_threshold != null &&
                      left <= p.reorder_threshold && (
                        <Badge
                          variant="destructive"
                          className="flex items-center gap-1 text-[10px]"
                        >
                          <AlertTriangle className="h-3 w-3" /> Reorder
                        </Badge>
                      )}
                    <span className="font-medium tabular-nums">
                      {left}/{total || '?'}{' '}
                      <span className="font-normal text-muted-foreground">
                        doses
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => openEditDialog(p)}
                      aria-label="Edit pen/vial"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => deletePenMutation.mutate(p.id)}
                      disabled={deletePenMutation.isPending}
                      aria-label="Remove pen/vial"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${low ? 'bg-amber-500' : 'bg-blue-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {(p.expiry_date || p.bud_date) && (
                  <div className="mt-1.5 flex gap-3 text-xs text-muted-foreground flex-wrap items-center">
                    {p.expiry_date && (
                      <span className="flex items-center gap-1">
                        Exp {p.expiry_date}
                        {expStatus === 'expired' && (
                          <Badge
                            variant="destructive"
                            className="text-[9px] px-1 py-0 h-4"
                          >
                            Expired
                          </Badge>
                        )}
                        {expStatus === 'near' && (
                          <Badge className="text-[9px] px-1 py-0 h-4 bg-amber-500 text-white hover:bg-amber-600">
                            Near Exp
                          </Badge>
                        )}
                      </span>
                    )}
                    {p.bud_date && (
                      <span className="flex items-center gap-1">
                        BUD {p.bud_date}
                        {budStatus === 'expired' && (
                          <Badge
                            variant="destructive"
                            className="text-[9px] px-1 py-0 h-4"
                          >
                            Expired (BUD)
                          </Badge>
                        )}
                        {budStatus === 'near' && (
                          <Badge className="text-[9px] px-1 py-0 h-4 bg-amber-500 text-white hover:bg-amber-600 font-semibold">
                            BUD Warning
                          </Badge>
                        )}
                      </span>
                    )}
                  </div>
                )}
                {p.notes && (
                  <p className="mt-1.5 text-xs text-muted-foreground italic border-t pt-1">
                    Notes: {p.notes}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Add/Edit Inventory Dialog */}
      <Dialog open={inventoryOpen} onOpenChange={setInventoryOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingPen
                ? 'Edit Pen / Vial Inventory'
                : 'Add Pen / Vial Inventory'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="inv-kind">Kind</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => {
                    setKind(v as 'pen' | 'vial');
                    if (v === 'pen') {
                      setDosesTotal('4');
                    } else {
                      setDosesTotal('10');
                    }
                  }}
                >
                  <SelectTrigger id="inv-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pen">Pen</SelectItem>
                    <SelectItem value="vial">Vial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="inv-label">Label / Name</Label>
                <Input
                  id="inv-label"
                  placeholder="e.g. Pen #2, Vial Batch A"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="inv-dose">Dose Strength (mg)</Label>
                <Input
                  id="inv-dose"
                  type="number"
                  step="0.05"
                  value={inventoryDoseMg}
                  onChange={(e) => setInventoryDoseMg(e.target.value)}
                  placeholder={
                    med.dose_amount != null ? String(med.dose_amount) : '0'
                  }
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="inv-doses-total">Total Doses</Label>
                <Input
                  id="inv-doses-total"
                  type="number"
                  value={dosesTotal}
                  onChange={(e) => setDosesTotal(e.target.value)}
                />
              </div>
            </div>

            {kind === 'vial' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="inv-concentration">
                    Concentration (mg/mL)
                  </Label>
                  <Input
                    id="inv-concentration"
                    type="number"
                    step="0.1"
                    placeholder="e.g. 5"
                    value={concentration}
                    onChange={(e) => setConcentration(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="inv-volume">Volume (mL)</Label>
                  <Input
                    id="inv-volume"
                    type="number"
                    step="0.1"
                    placeholder="e.g. 2"
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="inv-opened">Date Opened</Label>
                <Input
                  id="inv-opened"
                  type="date"
                  value={openedAt}
                  onChange={(e) => setOpenedAt(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="inv-expiry">Expiry Date</Label>
                <Input
                  id="inv-expiry"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
            </div>

            {openedAt && (
              <div className="rounded-md bg-muted p-2 text-xs">
                <span className="font-semibold text-muted-foreground">
                  Calculated Beyond-Use Date (BUD):
                </span>{' '}
                <span className="font-medium">
                  {calculatedBudDate || 'N/A'}
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Based on 28-day stability window from first opening.
                </p>
              </div>
            )}

            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="inv-reorder" className="flex flex-col gap-0.5">
                  <span>Enable Reorder Warning</span>
                  <span className="font-normal text-[10px] text-muted-foreground">
                    Alert when remaining doses are low
                  </span>
                </Label>
                <Switch
                  id="inv-reorder"
                  checked={reorderFlag}
                  onCheckedChange={setReorderFlag}
                />
              </div>

              {reorderFlag && (
                <div className="space-y-1 pt-1">
                  <Label htmlFor="inv-threshold">
                    Reorder Threshold (doses left)
                  </Label>
                  <Input
                    id="inv-threshold"
                    type="number"
                    value={reorderThreshold}
                    onChange={(e) => setReorderThreshold(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="inv-notes">Notes</Label>
              <Textarea
                id="inv-notes"
                placeholder="Batch number, brand, pharmacy info..."
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInventoryOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveInventory} disabled={savePending}>
              {savePending
                ? 'Saving...'
                : editingPen
                  ? 'Save Changes'
                  : 'Add Inventory'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
