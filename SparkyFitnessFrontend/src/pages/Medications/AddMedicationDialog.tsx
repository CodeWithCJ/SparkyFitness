import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Star, Pill } from 'lucide-react';
import {
  FOOD_VARIANT_NUTRIENT_FIELDS,
  GLP1_DRUG_PROFILES,
  normalizeNutrientName,
} from '@workspace/shared';
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
import type { Medication, MedicationNutrients } from '@/types/medications';
import type { GlycemicIndex } from '@/types/food';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { usePreferences } from '@/contexts/PreferencesContext';
import { NutrientGrid } from '@/components/FoodSearch/NutrientFormGrid';
import { createDefaultFormVariant } from '@/utils/foodForm';
import {
  MED_TYPES,
  MED_TYPE_ICONS,
  MED_TYPE_COLORS,
  SUPPLEMENT_FORMS,
  positiveDoseOrNull,
} from './medicationUtils';
import { NutrientPicker } from './NutrientPicker';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import type { NutrientPick } from './nutrientPickerUtils';
import {
  useCreateCustomNutrientMutation,
  useEnsureCatalogNutrientsMutation,
} from '@/hooks/Foods/useCustomNutrients';
import type { UserCustomNutrient } from '@/types/customNutrient';

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
  defaultIsSupplement = false,
  open: openProp,
  onOpenChange,
}: {
  editMed?: Medication;
  trigger?: ReactNode;
  /** Opens with the supplement toggle already on — used by the "Add supplement" entry point. */
  defaultIsSupplement?: boolean;
  /** Controlled open state. When supplied the dialog renders no trigger of its own. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();
  const { data: customNutrients } = useCustomNutrients();
  // A supplement's nutrients are seeded as custom nutrient definitions, which are
  // gated by the diary permission — they feed the dependent's nutrition totals, so
  // managing medications alone does not authorise writing them. Without this check
  // a medication-only caregiver hits an opaque RLS failure that aborts the whole
  // save; with it they get a medication they can still schedule and log.
  const { hasWritePermission } = useActiveUser();
  const canEditNutrients = hasWritePermission('diary');
  const isEdit = Boolean(editMed);
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const [name, setName] = useState(editMed?.name ?? '');
  const [typeId, setTypeId] = useState(() => {
    const isSupp = editMed?.is_supplement ?? defaultIsSupplement;
    const initial = editMed?.type_id ?? (isSupp ? 'capsule' : 'pill');
    // A supplement whose stored type_id predates dose-forms (e.g. 'pill') would show the
    // 'capsule' fallback in the Select but silently save the stale value; normalise it up
    // front so what's displayed is what's saved.
    return isSupp && !(SUPPLEMENT_FORMS as readonly string[]).includes(initial)
      ? 'capsule'
      : initial;
  });
  const [isGlp1, setIsGlp1] = useState(editMed?.is_glp1 ?? false);
  const [isSupplement, setIsSupplement] = useState(
    editMed?.is_supplement ?? defaultIsSupplement
  );
  // The nutrient rows the editor shows. Additive and user-chosen: a new supplement
  // starts with none, and an existing one shows exactly what was saved against it.
  const [selectedNutrients, setSelectedNutrients] = useState<string[]>(() => {
    const saved = editMed?.nutrients;
    if (!saved) return [];
    return [
      ...FOOD_VARIANT_NUTRIENT_FIELDS.filter(
        (field) => typeof saved[field] === 'number'
      ),
      ...Object.keys(saved.custom_nutrients ?? {}),
    ];
  });
  // Rows the user picked that have no `user_custom_nutrients` row yet. Held here, and
  // find-or-created only on save — picking used to create them immediately, so a
  // mis-click on "Multivitamin panel" followed by Cancel permanently left ~20 custom
  // nutrients (plus display-preference and goal entries) behind.
  const [pendingNutrients, setPendingNutrients] = useState<
    Record<string, { catalogId?: string; unit: string; isNew?: boolean }>
  >({});

  const [nutrientVariant, setNutrientVariant] = useState(() =>
    createDefaultFormVariant(undefined, {
      serving_size: 1,
      serving_unit: 'dose',
      ...editMed?.nutrients,
      custom_nutrients: editMed?.nutrients?.custom_nutrients ?? {},
    })
  );
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
  const [doseAmount, setDoseAmount] = useState(
    editMed?.dose_amount != null ? String(editMed.dose_amount) : ''
  );
  const [doseUnit, setDoseUnit] = useState(editMed?.dose_unit ?? '');
  // Rows whose dose mirrors strength (or is all-null) keep live-following the
  // strength inputs; a distinct dose (e.g. set from mobile) is preserved verbatim.
  const [doseTouched, setDoseTouched] = useState(
    editMed != null &&
      (editMed.dose_amount !== editMed.strength_value ||
        (editMed.dose_unit ?? null) !== (editMed.strength_unit ?? null))
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
  const ensureCatalog = useEnsureCatalogNutrientsMutation();
  const createCustom = useCreateCustomNutrientMutation();

  // The grid renders a custom-nutrient row only if it can find the nutrient by name, so
  // pending picks are shown as provisional entries until save makes them real.
  const gridCustomNutrients = useMemo(() => {
    const existing = customNutrients ?? [];
    const known = new Set(existing.map((nutrient) => nutrient.name));
    const provisional = Object.entries(pendingNutrients)
      .filter(([key]) => !known.has(key))
      .map(
        ([key, pending]) =>
          ({
            id: `pending:${key}`,
            name: key,
            unit: pending.unit,
          }) as UserCustomNutrient
      );
    return [...existing, ...provisional];
  }, [customNutrients, pendingNutrients]);

  // Deduped as a set: two catalog picks can resolve onto the SAME existing custom
  // nutrient (when its aliases cover both), so the incoming keys are not guaranteed
  // unique among themselves, and a duplicate row would collide on its React key.
  const addNutrients = (picks: NutrientPick[]) => {
    // A free-text name that is really a fixed food-variant field (e.g. "protein" or
    // "Protein") routes to that column instead of becoming a divergent custom nutrient:
    // otherwise the value lands in the fixed field while a junk custom row is also created.
    const normalizedPicks = picks.map((pick) => {
      if (!pick.isNew) return pick;
      const fixed = FOOD_VARIANT_NUTRIENT_FIELDS.find(
        (field) =>
          normalizeNutrientName(field) === normalizeNutrientName(pick.key)
      );
      return fixed ? { key: fixed, unit: pick.unit } : pick;
    });
    setSelectedNutrients((current) => [
      ...new Set([...current, ...normalizedPicks.map((pick) => pick.key)]),
    ]);
    setPendingNutrients((current) => {
      const next = { ...current };
      for (const pick of normalizedPicks) {
        // Only catalog and free-text picks need creating; a fixed column or an existing
        // custom nutrient is already storable under its key.
        if (pick.catalogId || pick.isNew) {
          next[pick.key] = {
            catalogId: pick.catalogId,
            unit: pick.unit,
            isNew: pick.isNew,
          };
        }
      }
      return next;
    });
  };

  const removeNutrient = (key: string) => {
    setSelectedNutrients((current) => current.filter((item) => item !== key));
  };

  // The multivitamin panel adds ~20 rows in one click, so undoing a mis-click one
  // hover-and-X at a time is not a real escape hatch. Values stay in the variant but
  // getNutrients() only reads selected rows, so dropping the keys is enough.
  const clearNutrients = () => {
    setSelectedNutrients([]);
    setPendingNutrients({});
  };

  const updateNutrient = (
    _index: number,
    field: string,
    value: undefined | number | boolean | GlycemicIndex
  ) => {
    // Decided against the loaded custom-nutrient list: the standard fields are a fixed,
    // known set, so anything outside it is a custom nutrient by definition. That keeps
    // the routing independent of whether the custom-nutrient query has resolved yet.
    const isCustomNutrient = !(
      FOOD_VARIANT_NUTRIENT_FIELDS as readonly string[]
    ).includes(field);
    setNutrientVariant((current) => {
      if (isCustomNutrient) {
        return {
          ...current,
          custom_nutrients: {
            ...current.custom_nutrients,
            [field]: value === undefined ? '' : Number(value),
          },
        };
      }
      return {
        ...current,
        [field]:
          value === undefined
            ? undefined
            : field === 'calories'
              ? convertEnergy(Number(value), energyUnit, 'kcal')
              : Number(value),
      };
    });
  };

  // Only the rows the user actually chose are saved. A value typed into a row that was
  // then removed stays in form state (so re-adding the row restores it) but must not
  // reach the payload.
  const getNutrients = (
    // Pending rows are stored under a provisional key (the catalog's canonical name).
    // The server may resolve that onto a nutrient the user already has under a different
    // spelling ("Vitamin D" -> their "Vit D"), so the value has to move with it.
    rename: Record<string, string> = {}
  ): MedicationNutrients => {
    const selected = new Set(selectedNutrients);
    const nutrients: MedicationNutrients = {};
    FOOD_VARIANT_NUTRIENT_FIELDS.forEach((field) => {
      if (!selected.has(field)) return;
      const value = nutrientVariant[field];
      if (typeof value === 'number' && Number.isFinite(value))
        nutrients[field] = value;
    });
    const custom = Object.fromEntries(
      Object.entries(nutrientVariant.custom_nutrients ?? {}).flatMap(
        ([name, value]) =>
          selected.has(name) &&
          typeof value === 'number' &&
          Number.isFinite(value)
            ? [[rename[name] ?? name, value] as const]
            : []
      )
    );
    if (Object.keys(custom).length > 0) nutrients.custom_nutrients = custom;
    return nutrients;
  };

  /**
   * Creates the nutrients the user picked but that don't exist yet, at SAVE time.
   * Returns a provisional-key -> real-key map, or null if creation failed (the mutation
   * surfaces its own toast; the caller aborts the save so nothing is half-written).
   */
  const commitPendingNutrients = async (): Promise<Record<
    string,
    string
  > | null> => {
    const selected = new Set(selectedNutrients);
    const catalogIds: string[] = [];
    const provisionalByCatalogId: Record<string, string> = {};
    const freeText: { key: string; unit: string }[] = [];

    for (const [key, pending] of Object.entries(pendingNutrients)) {
      if (!selected.has(key)) continue; // picked, then removed again
      if (pending.catalogId) {
        catalogIds.push(pending.catalogId);
        provisionalByCatalogId[pending.catalogId] = key;
      } else if (pending.isNew) {
        freeText.push({ key, unit: pending.unit });
      }
    }

    const prunePending = (key: string) =>
      setPendingNutrients((current) => {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });

    const rename: Record<string, string> = {};
    try {
      if (catalogIds.length > 0) {
        const result = await ensureCatalog.mutateAsync(catalogIds);
        for (const entry of result.resolved) {
          const provisional = provisionalByCatalogId[entry.catalogId];
          const actual = entry.fixedField ?? entry.name;
          if (provisional && provisional !== actual)
            rename[provisional] = actual;
        }
        // ensureCatalog is find-or-create; still, drop these from pending so they are not
        // re-processed on a later save of the same dialog.
        for (const key of Object.values(provisionalByCatalogId))
          prunePending(key);
      }
      for (const nutrient of freeText) {
        await createCustom.mutateAsync({
          name: nutrient.key,
          unit: nutrient.unit,
          forSupplement: true,
        });
        // Free-text creation is a plain INSERT against a UNIQUE(user_id, name), NOT
        // find-or-create — so prune each one the instant it succeeds. Otherwise a second
        // save (a retry after a failed medication write, or re-opening an edited
        // supplement whose dialog instance persists) re-INSERTs the same name, 500s on the
        // constraint, and bricks the save.
        prunePending(nutrient.key);
      }
    } catch {
      return null;
    }
    return rename;
  };

  // Injectable GLP-1 doses must stay in the strength unit: Glp1LogInjection,
  // the inventory manager, and the server injection repository all read
  // dose_amount as mg-per-injection, so the unit input is locked for them.
  const isInjectableGlp1 = isGlp1 && typeId === 'injection';
  const displayedDoseAmount = doseTouched ? doseAmount : strength;
  const displayedDoseUnit = isInjectableGlp1
    ? strengthUnit
    : doseTouched
      ? doseUnit
      : strengthUnit;

  const handleDoseAmountChange = (value: string) => {
    if (!doseTouched) {
      setDoseTouched(true);
      setDoseUnit(displayedDoseUnit);
    }
    setDoseAmount(value);
  };

  const handleDoseUnitChange = (value: string) => {
    if (!doseTouched) {
      setDoseTouched(true);
      setDoseAmount(displayedDoseAmount);
    }
    setDoseUnit(value);
  };

  const handleSave = async () => {
    // Create the picked-but-not-yet-existing nutrients now, not when they were picked.
    let rename: Record<string, string> = {};
    if (isSupplement && Object.keys(pendingNutrients).length > 0) {
      const resolved = await commitPendingNutrients();
      if (resolved === null) return; // creation failed; don't save a half-built payload
      rename = resolved;
      // Fold provisional -> actual catalog renames into local state (commit already pruned
      // pending). The body below still uses getNutrients(rename) for THIS save; this update
      // is for any subsequent save of the same dialog — a retry, or an edit re-save — so it
      // sends the final nutrient names and re-creates nothing.
      if (Object.keys(rename).length > 0) {
        setSelectedNutrients((current) => [
          ...new Set(current.map((key) => rename[key] ?? key)),
        ]);
        setNutrientVariant((current) => {
          const custom = { ...(current.custom_nutrients ?? {}) };
          for (const [provisional, actual] of Object.entries(rename)) {
            if (provisional !== actual && custom[provisional] !== undefined) {
              custom[actual] = custom[provisional];
              delete custom[provisional];
            }
          }
          return { ...current, custom_nutrients: custom };
        });
      }
    }

    const body: Partial<Medication> & { name: string } = {
      name: name.trim(),
      type_id: typeId,
      is_glp1: isGlp1,
      is_supplement: isSupplement,
      nutrients: isSupplement ? getNutrients(rename) : {},
      // The supplement form hides strength entirely, so never persist a leftover unit
      // for one (matching how the dose fields are pinned below).
      strength_value: isSupplement ? null : strength ? Number(strength) : null,
      strength_unit: isSupplement ? null : strengthUnit || null,
      // A supplement's nutrient payload is expressed per dose, so v1 pins the dose at
      // exactly one and "nutrition per dose" carries a single meaning. The entry
      // snapshot already multiplies by dose_amount, so letting supplements carry a
      // real dose is a natural follow-up once the editor states what the payload is
      // per. Medications use the dose fields this dialog now edits directly;
      // positiveDoseOrNull keeps a typed 0 or negative out of a body the API rejects.
      dose_amount: isSupplement ? 1 : positiveDoseOrNull(displayedDoseAmount),
      dose_unit: isSupplement ? 'dose' : displayedDoseUnit || null,
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
        setStrength('');
        setStrengthUnit('mg');
        setDoseAmount('');
        setDoseUnit('');
        setDoseTouched(false);
        setPrescriber('');
        setPharmacy('');
        setRxNumber('');
        setReason('');
        setNotes('');
        setEffectiveness(0);
        setPhotoPath('');
        setIsSupplement(defaultIsSupplement);
        setSelectedNutrients([]);
        setPendingNutrients({});
        setNutrientVariant(
          createDefaultFormVariant(undefined, {
            serving_size: 1,
            serving_unit: 'dose',
          })
        );
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button>
              <Plus className="mr-2 h-4 w-4" />{' '}
              {t('medications.cabinet.addMed', 'Add medication')}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isSupplement
              ? isEdit
                ? t('medications.cabinet.editSupplement', 'Edit supplement')
                : t('medications.cabinet.addSupplement', 'Add supplement')
              : isEdit
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
              placeholder={
                isSupplement
                  ? t(
                      'medications.cabinet.supplementNamePlaceholder',
                      'e.g. Vitamin D3'
                    )
                  : t('medications.cabinet.namePlaceholder', 'e.g. Wegovy')
              }
            />
          </div>
          {isSupplement ? (
            /* Supplements: a single dose-form select (repurposed med type). No strength —
               the nutrient picker below carries the per-dose amounts, so a separate
               strength field would be redundant and confusing. */
            <div className="space-y-2">
              <Label>{t('medications.cabinet.doseForm', 'Form')}</Label>
              <Select
                value={
                  (SUPPLEMENT_FORMS as readonly string[]).includes(typeId)
                    ? typeId
                    : 'capsule'
                }
                onValueChange={setTypeId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPLEMENT_FORMS.map((form) => (
                    <SelectItem key={form} value={form}>
                      <span className="flex items-center gap-2 capitalize">
                        <MedTypeIcon typeId={form} className="h-4 w-4" />
                        {t('medications.forms.' + form, form)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
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
                          <MedTypeIcon
                            typeId={typeOption}
                            className="h-4 w-4"
                          />
                          {t('medications.types.' + typeOption, typeOption)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="med-strength-value">
                  {t('medications.cabinet.strength', 'Strength')}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="med-strength-value"
                    type="number"
                    value={strength}
                    onChange={(e) => setStrength(e.target.value)}
                    placeholder="1.0"
                  />
                  <Input
                    className="w-20"
                    aria-label={t(
                      'medications.cabinet.strengthUnit',
                      'Strength unit'
                    )}
                    value={strengthUnit}
                    onChange={(e) => setStrengthUnit(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2 col-start-2">
                <Label htmlFor="med-dose-amount">
                  {isInjectableGlp1
                    ? t(
                        'medications.cabinet.dosePerInjection',
                        'Dose per injection'
                      )
                    : t('medications.cabinet.dose', 'Dose')}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="med-dose-amount"
                    type="number"
                    value={displayedDoseAmount}
                    onChange={(e) => handleDoseAmountChange(e.target.value)}
                  />
                  <Input
                    className="w-20"
                    aria-label={t('medications.cabinet.doseUnit', 'Dose unit')}
                    value={displayedDoseUnit}
                    onChange={(e) => handleDoseUnitChange(e.target.value)}
                    disabled={isInjectableGlp1}
                  />
                </div>
                {!doseTouched && (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'medications.cabinet.doseFollowsStrength',
                      'Matches strength until you change it.'
                    )}
                  </p>
                )}
              </div>
            </div>
          )}
          {/* GLP-1 is a medication concept — hidden on the dedicated supplement form. */}
          {!isSupplement && (
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
          )}
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
          {isSupplement && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/20">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Label className="text-sm font-medium">
                    {t(
                      'medications.cabinet.nutritionPerDose',
                      'Nutrition per dose'
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'medications.cabinet.nutritionPerDoseHint',
                      'Add the nutrients on the label, then enter the amount supplied by one dose.'
                    )}
                  </p>
                </div>
                {canEditNutrients && selectedNutrients.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground"
                    onClick={clearNutrients}
                  >
                    {t('medications.cabinet.clearNutrients', 'Remove all')}
                  </Button>
                )}
              </div>
              {!canEditNutrients ? (
                <p className="text-xs text-muted-foreground">
                  {t(
                    'medications.cabinet.nutrientsNeedDiaryAccess',
                    'Nutrition per dose needs food diary access for this profile. You can still save the supplement and track its schedule, reminders and doses.'
                  )}
                </p>
              ) : (
                <>
                  {selectedNutrients.length > 0 && (
                    <NutrientGrid
                      variantIndex={0}
                      variant={nutrientVariant}
                      visibleNutrients={selectedNutrients}
                      energyUnit={energyUnit}
                      convertEnergy={convertEnergy}
                      customNutrients={gridCustomNutrients}
                      onUpdate={updateNutrient}
                      onRemove={removeNutrient}
                    />
                  )}
                  <NutrientPicker
                    selected={selectedNutrients}
                    customNutrients={gridCustomNutrients}
                    onAdd={addNutrients}
                  />
                </>
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
          {/* Rx details are meaningless for supplements — hidden when the supplement
              toggle is on (a supplement is prescriber/pharmacy/Rx-free by nature). */}
          {!isSupplement && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="med-prescriber">
                    {t(
                      'medications.cabinet.prescriber',
                      'Prescriber (optional)'
                    )}
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
            </>
          )}

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
            onClick={() => void handleSave()}
            disabled={
              !name.trim() ||
              mutation.isPending ||
              ensureCatalog.isPending ||
              createCustom.isPending
            }
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
