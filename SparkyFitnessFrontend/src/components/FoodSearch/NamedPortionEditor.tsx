import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import type { FoodPortionDefinition } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NamedPortionEditorProps {
  unit: 'g' | 'ml' | null;
  onAdd: (definition: FoodPortionDefinition) => boolean;
  children?: ReactNode;
}

export function NamedPortionEditor({
  unit,
  onAdd,
  children,
}: NamedPortionEditorProps) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState(false);
  const close = () => {
    setOpen(false);
    setName('');
    setAmount('');
    setError(false);
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          {t('customFoodForm.portions', 'Named portions')}
        </h3>
        {!open && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!unit}
            onClick={() => setOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t('customFoodForm.addPortion', 'Add portion')}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {unit
          ? t(
              'customFoodForm.portionsHelp',
              'Define a package, slice, or other portion by its known weight or volume. Nutrition is calculated from this food; you can still log any gram or milliliter quantity.'
            )
          : t(
              'customFoodForm.portionsNeedReference',
              'Add a weight or volume unit first to calculate portions.'
            )}
      </p>
      {children}
      {open && unit && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${id}-name`}>
                {t('customFoodForm.portionName', 'Portion name')}
              </Label>
              <Input
                id={`${id}-name`}
                value={name}
                maxLength={80}
                placeholder={t(
                  'customFoodForm.portionNamePlaceholder',
                  'e.g. Package'
                )}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(false);
                }}
              />
            </div>
            <div>
              <Label htmlFor={`${id}-amount`}>
                {unit === 'g'
                  ? t('customFoodForm.portionWeight', 'Weight (g)')
                  : t('customFoodForm.portionVolume', 'Volume (ml)')}
              </Label>
              <Input
                id={`${id}-amount`}
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setError(false);
                }}
              />
            </div>
          </div>
          {name.trim() && Number(amount) > 0 && (
            <p className="text-sm">
              1 {name.trim()} = {amount} {unit}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t(
                'customFoodForm.portionInvalid',
                'Enter a unique portion name and a positive amount. A portion with this name and amount may already exist.'
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={
                !name.trim() ||
                !Number.isFinite(Number(amount)) ||
                Number(amount) <= 0
              }
              onClick={() => {
                if (onAdd({ name, amount: Number(amount), unit })) close();
                else setError(true);
              }}
            >
              {t('customFoodForm.addPortionToFood', 'Add portion to food')}
            </Button>
            <Button type="button" variant="ghost" onClick={close}>
              {t('customFoodForm.cancelButton', 'Cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function NamedPortionSummary({
  label,
  nutrition,
  onRemove,
  children,
}: {
  label: string;
  nutrition: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">{nutrition}</p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(!editing)}
          >
            {editing
              ? t('customFoodForm.hidePortionDetails', 'Hide details')
              : t('customFoodForm.editPortionDetails', 'Edit unit')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            {t('customFoodForm.removePortion', 'Remove portion')}
          </Button>
        </div>
      </div>
      {editing && children}
    </div>
  );
}
