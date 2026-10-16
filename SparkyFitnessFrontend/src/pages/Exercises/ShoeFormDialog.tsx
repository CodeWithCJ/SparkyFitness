import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_SHOE_RETIREMENT_DISTANCE_KM,
  type CreateShoeBody,
  type ShoeResponse,
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
import { usePreferences } from '@/contexts/PreferencesContext';

interface ShoeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pair being edited; omit to add a new one. */
  shoe?: ShoeResponse | null;
  onSubmit: (data: CreateShoeBody) => Promise<unknown>;
  isSaving: boolean;
}

const optionalText = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const optionalNumber = (value: string): number | null =>
  value.trim() === '' ? null : Number(value);

export const ShoeFormDialog: React.FC<ShoeFormDialogProps> = ({
  open,
  onOpenChange,
  shoe,
  onSubmit,
  isSaving,
}) => {
  const { t } = useTranslation();
  const { distanceUnit, convertDistance } = usePreferences();
  const unitLabel = distanceUnit === 'miles' ? 'mi' : 'km';
  // Distances are stored in km; the form edits them in the user's unit.
  const toDisplay = (km: number) =>
    String(Number(convertDistance(km, 'km', distanceUnit).toFixed(1)));

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [nickname, setNickname] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [startingDistance, setStartingDistance] = useState('0');
  const [retirementDistance, setRetirementDistance] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(shoe?.name ?? '');
    setBrand(shoe?.brand ?? '');
    setModel(shoe?.model ?? '');
    setNickname(shoe?.nickname ?? '');
    setPurchaseDate(shoe?.purchase_date ?? '');
    setPurchasePrice(
      shoe?.purchase_price != null ? String(shoe.purchase_price) : ''
    );
    setStartingDistance(shoe ? toDisplay(shoe.starting_distance_km) : '0');
    setRetirementDistance(
      toDisplay(
        shoe?.retirement_distance_km ?? DEFAULT_SHOE_RETIREMENT_DISTANCE_KM
      )
    );
    setIsDefault(shoe?.is_default ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shoe]);

  const retirementValue = Number(retirementDistance);
  const startingValue = Number(startingDistance || 0);
  const isValid =
    name.trim() !== '' &&
    retirementValue > 0 &&
    startingValue >= 0 &&
    !Number.isNaN(startingValue);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid) return;
    try {
      await onSubmit({
        name: name.trim(),
        brand: optionalText(brand),
        model: optionalText(model),
        nickname: optionalText(nickname),
        purchase_date: purchaseDate || null,
        purchase_price: optionalNumber(purchasePrice),
        starting_distance_km:
          shoe && startingDistance === toDisplay(shoe.starting_distance_km)
            ? shoe.starting_distance_km
            : convertDistance(startingValue, distanceUnit, 'km'),
        retirement_distance_km:
          shoe && retirementDistance === toDisplay(shoe.retirement_distance_km)
            ? shoe.retirement_distance_km
            : convertDistance(retirementValue, distanceUnit, 'km'),
        is_default: isDefault,
      });
      onOpenChange(false);
    } catch {
      // The mutation already shows the error toast; keep the dialog open.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {shoe
                ? t('shoes.editShoe', 'Edit shoe')
                : t('shoes.addShoe', 'Add shoe')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'shoes.formDescription',
                'Track the mileage on a pair and get a nudge when it is time to replace it.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="shoe-name">{t('shoes.name', 'Name')}</Label>
            <Input
              id="shoe-name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="shoe-brand">{t('shoes.brand', 'Brand')}</Label>
              <Input
                id="shoe-brand"
                value={brand}
                maxLength={120}
                onChange={(e) => setBrand(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shoe-model">{t('shoes.model', 'Model')}</Label>
              <Input
                id="shoe-model"
                value={model}
                maxLength={120}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="shoe-nickname">
              {t('shoes.nickname', 'Nickname')}
            </Label>
            <Input
              id="shoe-nickname"
              value={nickname}
              maxLength={120}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="shoe-purchase-date">
                {t('shoes.purchaseDate', 'Purchase date')}
              </Label>
              <Input
                id="shoe-purchase-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shoe-purchase-price">
                {t('shoes.purchasePrice', 'Price')}
              </Label>
              <Input
                id="shoe-purchase-price"
                type="number"
                min="0"
                step="0.01"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="shoe-starting">
                {t('shoes.startingDistance', 'Starting mileage ({{unit}})', {
                  unit: unitLabel,
                })}
              </Label>
              <Input
                id="shoe-starting"
                type="number"
                min="0"
                step="0.1"
                value={startingDistance}
                onChange={(e) => setStartingDistance(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shoe-retirement">
                {t('shoes.retireAt', 'Retire at ({{unit}})', {
                  unit: unitLabel,
                })}
              </Label>
              <Input
                id="shoe-retirement"
                type="number"
                min="1"
                step="0.1"
                value={retirementDistance}
                onChange={(e) => setRetirementDistance(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="shoe-default" className="cursor-pointer">
              {t('shoes.useAsDefault', 'Use as my default pair')}
            </Label>
            <Switch
              id="shoe-default"
              checked={isDefault}
              onCheckedChange={setIsDefault}
              disabled={shoe?.status === 'retired'}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={!isValid || isSaving}>
              {isSaving
                ? t('common.saving', 'Saving...')
                : t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
