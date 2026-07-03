import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Star, Pill } from 'lucide-react';
import { GLP1_DRUG_PROFILES } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateMedicationMutation,
  useUpdateMedicationMutation,
} from '@/hooks/useMedications';
import type { Medication } from '@/types/medications';
import { MED_TYPES, MED_TYPE_ICONS, MED_TYPE_COLORS } from './medicationUtils';

export function MedTypeIcon({
  typeId,
  isGlp1,
  className,
}: {
  typeId?: string | null;
  isGlp1?: boolean;
  className?: string;
}) {
  const key = typeId ?? (isGlp1 ? 'injection' : 'other');
  const Icon = MED_TYPE_ICONS[key] ?? Pill;
  const color = MED_TYPE_COLORS[key] ?? 'text-muted-foreground';
  return <Icon className={`${color} ${className ?? ''}`} />;
}

export default function AddMedicationDialog({
  editMed,
  trigger,
}: {
  editMed?: Medication;
  trigger?: ReactNode;
} = {}) {
  const { t } = useTranslation();
  const isEdit = Boolean(editMed);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(editMed?.name ?? '');
  const [typeId, setTypeId] = useState(editMed?.type_id ?? 'pill');
  const [isGlp1, setIsGlp1] = useState(editMed?.is_glp1 ?? false);
  const [glp1Drug, setGlp1Drug] = useState(
    (editMed?.custom_fields?.['glp1_drug'] as string | undefined) ??
      'semaglutide'
  );
  const [customName, setCustomName] = useState(
    (editMed?.custom_fields?.['custom_glp1_name'] as string | undefined) ?? ''
  );
  const [customHalfLife, setCustomHalfLife] = useState(
    editMed?.custom_fields?.['custom_half_life_days'] != null
      ? String(editMed.custom_fields['custom_half_life_days'])
      : '7.0'
  );
  const [customTMax, setCustomTMax] = useState(
    editMed?.custom_fields?.['custom_t_max_days'] != null
      ? String(editMed.custom_fields['custom_t_max_days'])
      : '1.5'
  );
  const [customCadence, setCustomCadence] = useState(
    (editMed?.custom_fields?.['custom_cadence'] as
      | 'weekly'
      | 'daily'
      | undefined) ?? 'weekly'
  );
  const [customIsOral, setCustomIsOral] = useState(
    (editMed?.custom_fields?.['custom_is_oral'] as boolean | undefined) ?? false
  );
  const [strength, setStrength] = useState(
    editMed?.strength_value != null ? String(editMed.strength_value) : ''
  );
  const [strengthUnit, setStrengthUnit] = useState(
    editMed?.strength_unit ?? 'mg'
  );
  const [prescriber, setPrescriber] = useState(editMed?.prescriber ?? '');
  const [pharmacy, setPharmacy] = useState(editMed?.pharmacy ?? '');
  const [rxNumber, setRxNumber] = useState(editMed?.rx_number ?? '');
  const [reason, setReason] = useState(editMed?.reason_text ?? '');
  const [notes, setNotes] = useState(editMed?.notes ?? '');
  const [effectiveness, setEffectiveness] = useState<number>(
    editMed?.effectiveness_rating ?? 0
  );
  const [photoPath, setPhotoPath] = useState(editMed?.photo_path ?? '');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const createMutation = useCreateMedicationMutation();
  const updateMutation = useUpdateMedicationMutation();
  const mutation = isEdit ? updateMutation : createMutation;

  const handleSave = () => {
    const body: Partial<Medication> & { name: string } = {
      name: name.trim(),
      type_id: typeId,
      is_glp1: isGlp1,
      strength_value: strength ? Number(strength) : null,
      strength_unit: strengthUnit || null,
      dose_amount: strength ? Number(strength) : null,
      dose_unit: strengthUnit || null,
      prescriber: prescriber.trim() || null,
      pharmacy: pharmacy.trim() || null,
      rx_number: rxNumber.trim() || null,
      reason_text: reason.trim() || null,
      notes: notes.trim() || null,
      effectiveness_rating: effectiveness > 0 ? effectiveness : null,
      photo_path: photoPath || null,
      custom_fields: isGlp1
        ? glp1Drug === 'custom'
          ? {
              glp1_drug: 'custom',
              custom_glp1_name: customName.trim() || null,
              custom_half_life_days: customHalfLife
                ? Number(customHalfLife)
                : 7.0,
              custom_t_max_days: customTMax ? Number(customTMax) : 1.5,
              custom_cadence: customCadence,
              custom_is_oral: customIsOral,
            }
          : { glp1_drug: glp1Drug }
        : {},
    };
    if (isEdit && editMed) {
      updateMutation.mutate(
        { id: editMed.id, body },
        { onSuccess: () => setOpen(false) }
      );
      return;
    }
    createMutation.mutate(body, {
      onSuccess: () => {
        setOpen(false);
        setName('');
        setPrescriber('');
        setPharmacy('');
        setRxNumber('');
        setReason('');
        setNotes('');
        setEffectiveness(0);
        setPhotoPath('');
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />{' '}
            {t('medications.cabinet.addMed', 'Add medication')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t('medications.cabinet.editMed', 'Edit medication')
              : t('medications.cabinet.addMed', 'Add medication')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="med-name">
              {t('medications.cabinet.name', 'Name')}
            </Label>
            <Input
              id="med-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(
                'medications.cabinet.namePlaceholder',
                'e.g. Wegovy'
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('medications.cabinet.type', 'Type')}</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MED_TYPES.map((typeOption) => (
                    <SelectItem key={typeOption} value={typeOption}>
                      <span className="flex items-center gap-2 capitalize">
                        <MedTypeIcon typeId={typeOption} className="h-4 w-4" />
                        {t('medications.types.' + typeOption, typeOption)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('medications.cabinet.strength', 'Strength')}</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={strength}
                  onChange={(e) => setStrength(e.target.value)}
                  placeholder="1.0"
                />
                <Input
                  className="w-20"
                  value={strengthUnit}
                  onChange={(e) => setStrengthUnit(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm font-medium">
                {t('medications.cabinet.glp1Med', 'GLP-1 medication')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  'medications.cabinet.glp1Hint',
                  'Unlocks the injection coach, PK curve & site rotation.'
                )}
              </p>
            </div>
            <Switch checked={isGlp1} onCheckedChange={setIsGlp1} />
          </div>
          {isGlp1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>
                  {t(
                    'medications.cabinet.glp1Drug',
                    'GLP-1 drug (for the PK model)'
                  )}
                </Label>
                <Select value={glp1Drug} onValueChange={setGlp1Drug}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(GLP1_DRUG_PROFILES).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.displayName}
                        {p.brands.length > 0 ? ` (${p.brands.join(', ')})` : ''}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">
                      {t(
                        'medications.cabinet.customGlp1',
                        'Custom GLP-1 / Other...'
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {glp1Drug === 'custom' && (
                <div className="space-y-4 rounded-md border p-3 bg-muted/20">
                  <div className="space-y-2">
                    <Label htmlFor="custom-glp-name">
                      {t(
                        'medications.cabinet.customGlpName',
                        'Custom Drug Name (optional)'
                      )}
                    </Label>
                    <Input
                      id="custom-glp-name"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="e.g. Retatrutide, Compound Semaglutide"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="custom-half-life">
                        {t(
                          'medications.cabinet.customHalfLife',
                          'Half-Life (days)'
                        )}
                      </Label>
                      <Input
                        id="custom-half-life"
                        type="number"
                        step="0.1"
                        value={customHalfLife}
                        onChange={(e) => setCustomHalfLife(e.target.value)}
                        placeholder="7.0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-tmax">
                        {t(
                          'medications.cabinet.customTMax',
                          'Time to Peak (days)'
                        )}
                      </Label>
                      <Input
                        id="custom-tmax"
                        type="number"
                        step="0.1"
                        value={customTMax}
                        onChange={(e) => setCustomTMax(e.target.value)}
                        placeholder="1.5"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>
                        {t('medications.cabinet.customCadence', 'Cadence')}
                      </Label>
                      <Select
                        value={customCadence}
                        onValueChange={(val: 'weekly' | 'daily') =>
                          setCustomCadence(val)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between pt-6">
                      <Label htmlFor="custom-oral-switch" className="text-xs">
                        {t(
                          'medications.cabinet.customIsOral',
                          'Oral administration'
                        )}
                      </Label>
                      <Switch
                        id="custom-oral-switch"
                        checked={customIsOral}
                        onCheckedChange={setCustomIsOral}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="med-reason">
              {t('medications.cabinet.reason', 'Reason / condition (optional)')}
            </Label>
            <Input
              id="med-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t(
                'medications.cabinet.reasonPlaceholder',
                'e.g. Weight management, Type 2 diabetes'
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="med-prescriber">
                {t('medications.cabinet.prescriber', 'Prescriber (optional)')}
              </Label>
              <Input
                id="med-prescriber"
                value={prescriber}
                onChange={(e) => setPrescriber(e.target.value)}
                placeholder={t(
                  'medications.cabinet.prescriberPlaceholder',
                  'Dr. Chen'
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="med-pharmacy">
                {t('medications.cabinet.pharmacy', 'Pharmacy (optional)')}
              </Label>
              <Input
                id="med-pharmacy"
                value={pharmacy}
                onChange={(e) => setPharmacy(e.target.value)}
                placeholder={t(
                  'medications.cabinet.pharmacyPlaceholder',
                  'CVS #4421'
                )}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="med-rx">
              {t('medications.cabinet.rxNumber', 'Rx number (optional)')}
            </Label>
            <Input
              id="med-rx"
              value={rxNumber}
              onChange={(e) => setRxNumber(e.target.value)}
              placeholder={t(
                'medications.cabinet.rxPlaceholder',
                'Rx-482-93221'
              )}
            />
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between border-t pt-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <span>
                {showAdvanced
                  ? t(
                      'medications.cabinet.hideAdvanced',
                      'Hide Advanced Options'
                    )
                  : t(
                      'medications.cabinet.showAdvanced',
                      'Show Advanced Options'
                    )}
              </span>
              <span className="text-[10px]">{showAdvanced ? '▲' : '▼'}</span>
            </button>

            {showAdvanced && (
              <div className="space-y-4 border-t pt-3 animate-in fade-in duration-200">
                {/* Effectiveness Rating */}
                <div className="space-y-2">
                  <Label>
                    {t(
                      'medications.cabinet.effectiveness',
                      'Effectiveness Rating'
                    )}
                  </Label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() =>
                          setEffectiveness(star === effectiveness ? 0 : star)
                        }
                        className="text-lg transition-transform hover:scale-110"
                        aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                      >
                        <Star
                          className={`h-5 w-5 ${
                            star <= effectiveness
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-muted-foreground/30'
                          }`}
                        />
                      </button>
                    ))}
                    {effectiveness > 0 && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setEffectiveness(0)}
                        className="h-auto p-0 text-xs text-muted-foreground ml-2"
                      >
                        {t('medications.common.clear', 'Clear')}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Photo Path */}
                <div className="space-y-2">
                  <Label htmlFor="med-photo-path">
                    {t(
                      'medications.cabinet.photoPath',
                      'Pill / Label Photo URL (optional)'
                    )}
                  </Label>
                  <Input
                    id="med-photo-path"
                    value={photoPath}
                    onChange={(e) => setPhotoPath(e.target.value)}
                    placeholder="https://example.com/pill.png"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="med-notes">
                    {t('medications.cabinet.notes', 'Notes / Instructions')}
                  </Label>
                  <Textarea
                    id="med-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t(
                      'medications.cabinet.notesPlaceholder',
                      'Take with water before breakfast. Avoid alcohol.'
                    )}
                    rows={3}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending
              ? t('medications.common.saving', 'Saving…')
              : t('medications.common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
