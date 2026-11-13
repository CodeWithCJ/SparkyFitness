import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import {
  inventoryConfigToBody,
  presetInventory,
  savePlateInventoryBodySchema,
  type BarKind,
  type PlateInventoryConfig,
  type PlateUnit,
} from '@workspace/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  barLabel,
  formatPlateWeight,
} from '@/components/PlateCalculator/plateFormat';

interface PlateRow {
  key: string;
  weight: string;
  pairs: string;
}

interface BarRow {
  id: string;
  name: string;
  kind: BarKind;
  weight: string;
}

interface DraftState {
  unit: PlateUnit;
  plates: PlateRow[];
  bars: BarRow[];
  collarsEnabled: boolean;
  collarWeight: string;
}

let rowCounter = 0;
const nextKey = (prefix: string) => `${prefix}-${Date.now()}-${rowCounter++}`;

const toDraft = (config: PlateInventoryConfig): DraftState => ({
  unit: config.unit,
  plates: config.plates.map((p) => ({
    key: nextKey('plate'),
    weight: formatPlateWeight(p.weight),
    pairs: String(p.pairs),
  })),
  bars: config.bars.map((b) => ({
    id: b.id,
    name: b.name ?? '',
    kind: b.kind,
    weight: formatPlateWeight(b.weight),
  })),
  collarsEnabled: config.collarsEnabled,
  collarWeight: formatPlateWeight(config.collarWeight),
});

interface PlateInventoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is saved now, or the preset for the person's unit. */
  initial: PlateInventoryConfig;
  hasSaved: boolean;
  onSubmit: (
    data: ReturnType<typeof inventoryConfigToBody>
  ) => Promise<unknown>;
  onReset: () => void;
  isSaving: boolean;
}

const PlateInventoryForm: React.FC<Omit<PlateInventoryDialogProps, 'open'>> = ({
  onOpenChange,
  initial,
  hasSaved,
  onSubmit,
  onReset,
  isSaving,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DraftState>(() => toDraft(initial));
  const [error, setError] = useState<string | null>(null);

  const patch = (changes: Partial<DraftState>) =>
    setDraft((current) => ({ ...current, ...changes }));

  const updatePlate = (key: string, changes: Partial<PlateRow>) =>
    patch({
      plates: draft.plates.map((p) =>
        p.key === key ? { ...p, ...changes } : p
      ),
    });
  const updateBar = (id: string, changes: Partial<BarRow>) =>
    patch({
      bars: draft.bars.map((b) => (b.id === id ? { ...b, ...changes } : b)),
    });

  const applyPreset = (unit: PlateUnit) => {
    setDraft(toDraft(presetInventory(unit)));
    setError(null);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = savePlateInventoryBodySchema.safeParse({
      weight_unit: draft.unit,
      bars: draft.bars.map((b) => ({
        id: b.id,
        name: b.name.trim() === '' ? null : b.name.trim(),
        kind: b.kind,
        weight: Number(b.weight),
      })),
      plates: draft.plates.map((p) => ({
        weight: Number(p.weight),
        pairs: Number(p.pairs),
      })),
      collars_enabled: draft.collarsEnabled,
      collar_weight: Number(draft.collarWeight || 0),
    });
    if (!parsed.success) {
      setError(
        t(
          'plates.invalid',
          'Check the weights and pairs: weights have at most 3 decimals, each plate size is listed once, and pairs are whole numbers up to 20.'
        )
      );
      return;
    }
    setError(null);
    await onSubmit({
      ...parsed.data,
      plates: [...parsed.data.plates].sort((a, b) => b.weight - a.weight),
    });
    onOpenChange(false);
  };

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={draft.unit === 'kg' ? 'default' : 'outline'}
          onClick={() => applyPreset('kg')}
        >
          {t('plates.useKgPlates', 'Use kg plates')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={draft.unit === 'lbs' ? 'default' : 'outline'}
          onClick={() => applyPreset('lbs')}
        >
          {t('plates.useLbPlates', 'Use lb plates')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t(
            'plates.presetHint',
            'Starts from the standard set; you can edit it below.'
          )}
        </span>
      </div>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">
          {t('plates.platesHeading', 'Plates ({{unit}})', {
            unit: draft.unit,
          })}
        </h4>
        {draft.plates.map((plate) => (
          <div key={plate.key} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor={`plate-weight-${plate.key}`} className="text-xs">
                {t('plates.plateWeight', 'Weight')}
              </Label>
              <Input
                id={`plate-weight-${plate.key}`}
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={plate.weight}
                onChange={(e) =>
                  updatePlate(plate.key, { weight: e.target.value })
                }
              />
            </div>
            <div className="w-24 space-y-1">
              <Label htmlFor={`plate-pairs-${plate.key}`} className="text-xs">
                {t('plates.pairs', 'Pairs')}
              </Label>
              <Input
                id={`plate-pairs-${plate.key}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={20}
                step={1}
                value={plate.pairs}
                onChange={(e) =>
                  updatePlate(plate.key, { pairs: e.target.value })
                }
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t('plates.removePlate', 'Remove plate {{weight}}', {
                weight: plate.weight,
              })}
              onClick={() =>
                patch({
                  plates: draft.plates.filter((p) => p.key !== plate.key),
                })
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            patch({
              plates: [
                ...draft.plates,
                { key: nextKey('plate'), weight: '', pairs: '1' },
              ],
            })
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('plates.addPlate', 'Add plate')}
        </Button>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">
          {t('plates.barsHeading', 'Bars ({{unit}})', { unit: draft.unit })}
        </h4>
        {draft.bars.map((bar) => (
          <div key={bar.id} className="flex flex-wrap items-end gap-2">
            <div className="min-w-32 flex-1 space-y-1">
              <Label htmlFor={`bar-name-${bar.id}`} className="text-xs">
                {t('plates.barName', 'Name')}
              </Label>
              <Input
                id={`bar-name-${bar.id}`}
                value={bar.name}
                maxLength={60}
                placeholder={barLabel(t, { name: null, kind: bar.kind })}
                onChange={(e) => updateBar(bar.id, { name: e.target.value })}
              />
            </div>
            <div className="w-24 space-y-1">
              <Label htmlFor={`bar-weight-${bar.id}`} className="text-xs">
                {t('plates.plateWeight', 'Weight')}
              </Label>
              <Input
                id={`bar-weight-${bar.id}`}
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={bar.weight}
                onChange={(e) => updateBar(bar.id, { weight: e.target.value })}
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={draft.bars.length <= 1}
              aria-label={t('plates.removeBar', 'Remove bar {{name}}', {
                name: bar.name || barLabel(t, { name: null, kind: bar.kind }),
              })}
              onClick={() =>
                patch({ bars: draft.bars.filter((b) => b.id !== bar.id) })
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            patch({
              bars: [
                ...draft.bars,
                { id: nextKey('bar'), name: '', kind: 'other', weight: '' },
              ],
            })
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('plates.addBar', 'Add bar')}
        </Button>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="plate-collars">
            {t('plates.collarsCount', 'Collars count')}
          </Label>
          <Switch
            id="plate-collars"
            checked={draft.collarsEnabled}
            onCheckedChange={(checked) => patch({ collarsEnabled: checked })}
          />
        </div>
        {draft.collarsEnabled && (
          <div className="w-40 space-y-1">
            <Label htmlFor="plate-collar-weight" className="text-xs">
              {t('plates.collarWeight', 'Weight of one collar ({{unit}})', {
                unit: draft.unit,
              })}
            </Label>
            <Input
              id="plate-collar-weight"
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={draft.collarWeight}
              onChange={(e) => patch({ collarWeight: e.target.value })}
            />
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        {hasSaved ? (
          <Button type="button" variant="ghost" onClick={onReset}>
            {t('plates.resetToStandard', 'Reset to standard')}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" disabled={isSaving}>
            {t('common.save', 'Save')}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
};

export const PlateInventoryDialog: React.FC<PlateInventoryDialogProps> = ({
  open,
  ...formProps
}) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={formProps.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('plates.editTitle', 'Plates & bars')}</DialogTitle>
          <DialogDescription>
            {t(
              'plates.editDescription',
              'Set the bars and plates you own. A pair is one plate for each side.'
            )}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted per open, so each opening starts from what is saved. */}
        {open && <PlateInventoryForm {...formProps} />}
      </DialogContent>
    </Dialog>
  );
};
