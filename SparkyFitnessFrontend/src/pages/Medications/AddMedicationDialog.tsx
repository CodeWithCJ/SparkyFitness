import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Star, Pill, HelpCircle } from 'lucide-react';
import {
  FOOD_VARIANT_NUTRIENT_FIELDS,
  MACRO_PICKER_FIELDS,
  GLP1_DRUG_PROFILES,
  normalizeNutrientName,
  resolveMacroFieldKey,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { NumericInput } from '@/components/NumericInput';
import { createDefaultFormVariant } from '@/utils/foodForm';
import {
  MED_TYPES,
  MED_TYPE_ICONS,
  MED_TYPE_COLORS,
  SUPPLEMENT_FORMS,
  MACRO_FIELD_KEYS,
  isCountableForm,
  hasMacroValue,
  isMacroField,
  positiveDoseOrNull,
  collectNutrientsToProvision,
  isStoredNutrientAmount,
  type NutrientPick,
} from './medicationUtils';
import { NutrientPicker } from './NutrientPicker';
import { useActiveUser } from '@/contexts/ActiveUserContext';
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
}: {
  editMed?: Medication;
  trigger?: ReactNode;
  /** Opens with the supplement toggle already on — used by the "Add supplement" entry point. */
  defaultIsSupplement?: boolean;
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
  const [open, setOpen] = useState(false);
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
      ...new Set([
        ...FOOD_VARIANT_NUTRIENT_FIELDS.filter(
          (field) => typeof saved[field] === 'number'
        ),
        // The macro block is all-or-nothing: it opens whenever ANY of the five was
        // saved, and only selected keys are saved, so seeding just the saved ones
        // leaves the other inputs visible, typeable and silently discarded. Selecting
        // all five keeps the invariant toggleMacros already holds — block open means
        // all five selected — and getNutrients() still stores nothing for the blanks.
        ...(hasMacroValue(saved) ? MACRO_FIELD_KEYS : []),
      ]),
      ...Object.keys(saved.custom_nutrients ?? {}),
    ];
  });
  // How many capsules/tablets make up one serving, as the label defines it. Purely
  // descriptive: nutrition is entered and stored per serving either way, so this changes
  // no arithmetic. It exists because the ambiguity it removes was previously handled with
  // a paragraph of prose, and a field the user fills in beats an explanation they have to
  // read and apply. Lives in custom_fields alongside the GLP-1 metadata; no migration.
  const [unitsPerServing, setUnitsPerServing] = useState(
    editMed?.custom_fields?.['units_per_serving'] != null
      ? String(editMed.custom_fields['units_per_serving'])
      : ''
  );

  // Energy and macros are a block rather than picker rows. Opens expanded only when the
  // saved supplement already carries one, so a vitamin-only supplement (the common case)
  // never has to look at five empty fields.
  const [includeMacros, setIncludeMacros] = useState(() =>
    hasMacroValue(editMed?.nutrients)
  );

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
  const createCustom = useCreateCustomNutrientMutation({ silentSuccess: true });

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
      // Macro names first, and by alias as well as by column: the five are not offered
      // as picker rows, so free text is the only way to name one, and "Energy" or
      // "Total Carbohydrate" would otherwise become a custom nutrient that no rollup
      // reads — a value accepted and then counted toward nothing.
      const macro = resolveMacroFieldKey(pick.key);
      if (macro) return { key: macro as string, unit: pick.unit };
      const fixed = FOOD_VARIANT_NUTRIENT_FIELDS.find(
        (field) =>
          normalizeNutrientName(field) === normalizeNutrientName(pick.key)
      );
      return fixed ? { key: fixed, unit: pick.unit } : pick;
    });
    // Reaching a macro key has to open the block, or the row is selected and saved while
    // the grid (which renders only the non-macro rows) never shows a field for it. Adding
    // all five keeps the invariant the checkbox holds: block open means all five selected.
    const addedMacro = normalizedPicks.some((pick) => isMacroField(pick.key));
    if (addedMacro) setIncludeMacros(true);
    setSelectedNutrients((current) => [
      ...new Set([
        ...current,
        ...normalizedPicks.map((pick) => pick.key),
        ...(addedMacro ? MACRO_FIELD_KEYS : []),
      ]),
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

  // Unchecking drops the macro keys rather than only hiding the fields. getNutrients()
  // reads selected rows only, so this is what keeps a collapsed block from going on
  // counting toward the diary: a stored value the form no longer shows would be exactly
  // the "record says 15 kcal, totals say zero" split this feature exists to avoid.
  // Names the countable thing, pluralised by the number entered. i18next resolves the
  // _one/_other suffix from `count`, so this stays translatable rather than gluing an "s"
  // on in code, which is wrong the moment the language is not English.
  const servingUnitCount = Number(unitsPerServing) || 1;
  const servingUnitLabel = t(
    `medications.cabinet.servingUnit_${typeId}`,
    servingUnitCount === 1 ? typeId : `${typeId}s`,
    { count: servingUnitCount }
  );

  // The picker's grid shows only what the picker put there; macros render separately.
  const micronutrientRows = selectedNutrients.filter(
    (key) => !isMacroField(key)
  );

  const toggleMacros = (next: boolean) => {
    setIncludeMacros(next);
    setSelectedNutrients((current) =>
      next
        ? [...new Set([...current, ...MACRO_FIELD_KEYS])]
        : current.filter((key) => !isMacroField(key))
    );
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
    // Checking the macro box adds its five keys, which is what makes this button appear.
    // Clearing the keys without unchecking left the block on screen, so the button looked
    // broken on a supplement that carried nothing else.
    setIncludeMacros(false);
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
      if (isStoredNutrientAmount(value)) nutrients[field] = value;
    });
    // Two provisional keys can resolve onto the SAME existing nutrient (the user's
    // "Vitamin D" absorbing both "Vitamin D2" and "Vitamin D3"), so build the object by
    // accumulating rather than via Object.fromEntries — the latter lets the second
    // value silently overwrite the first, dropping an amount the user typed.
    const custom: Record<string, number> = {};
    for (const [name, value] of Object.entries(
      nutrientVariant.custom_nutrients ?? {}
    )) {
      if (!selected.has(name)) continue;
      if (!isStoredNutrientAmount(value)) continue;
      const key = rename[name] ?? name;
      custom[key] = (custom[key] ?? 0) + value;
    }
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
    // Rows left blank are skipped: getNutrients() won't store them, so creating their
    // nutrient (plus goal and display-preference fan-out) would leave orphan rows the
    // supplement never references. They stay pending, so filling one in later and
    // re-saving still creates it.
    const { catalogIds, provisionalByCatalogId, freeText } =
      collectNutrientsToProvision(
        pendingNutrients,
        selectedNutrients,
        nutrientVariant.custom_nutrients
      );

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
      // On create a supplement is pinned to one dose. On EDIT the stored value is
      // preserved instead of being rewritten: the dose is gated server side now, so
      // forcing it back to 1 on every save would quietly undo a dose set through
      // another surface, and this form does not offer the field for supplements.
      dose_amount: isSupplement
        ? (editMed?.dose_amount ?? 1)
        : positiveDoseOrNull(displayedDoseAmount),
      dose_unit: isSupplement
        ? (editMed?.dose_unit ?? 'serving')
        : displayedDoseUnit || null,
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
    // Supplements never carry GLP-1 metadata, so the branch above leaves them an empty
    // object to extend.
    if (isSupplement) {
      const units = Number(unitsPerServing);
      body.custom_fields = {
        ...body.custom_fields,
        units_per_serving:
          Number.isFinite(units) && units > 0 ? units : undefined,
      };
    }
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
        // These two belong with the nutrient state above. Left set, the next supplement
        // opened from this dialog shows a ticked macro block whose values getNutrients()
        // then drops, because the keys are no longer selected: fields that look live and
        // save nothing. unitsPerServing would likewise carry over as another product's
        // serving size.
        setIncludeMacros(false);
        setUnitsPerServing('');
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
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />{' '}
            {t('medications.cabinet.addMed', 'Add medication')}
          </Button>
        )}
      </DialogTrigger>
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
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm font-medium">
                      {t(
                        'medications.cabinet.nutritionPerDose',
                        'Nutrition per serving'
                      )}
                    </Label>
                    {/* Tooltip rather than a popover: on a desktop-first form a help
                        glyph should answer on hover, not cost a click. Radix opens it on
                        focus too, so keyboard and tap both reach it. */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={t(
                              'medications.cabinet.nutritionHelpLabel',
                              'How to read your label'
                            )}
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        {/* Complements the line below rather than restating it: a worked
                            example, then the one label convention that has no obvious
                            answer. */}
                        {/* The default tooltip surface is bg-primary, which is a light
                            fill under a dark theme. Overridden to the popover tokens so it
                            reads as a surface in both. */}
                        <TooltipContent className="max-w-72 border bg-popover text-popover-foreground">
                          <p>
                            {t(
                              'medications.cabinet.nutritionHelpSubGram',
                              'A label reading "less than 1 g" does not state the amount. Enter 0.5 as a midpoint, or 0 to avoid overstating.'
                            )}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  {isCountableForm(typeId) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>
                        {t('medications.cabinet.servingEquals', '1 serving =')}
                      </span>
                      {/* Sized by the wrapper: Input carries w-full in its base classes,
                          which otherwise wins and pushes the unit onto its own line. */}
                      <div className="w-16">
                        <NumericInput
                          id="units-per-serving"
                          className="h-7"
                          min="1"
                          step="1"
                          decimals={0}
                          value={
                            unitsPerServing === ''
                              ? undefined
                              : Number(unitsPerServing)
                          }
                          placeholder="1"
                          onValueChange={(next) =>
                            setUnitsPerServing(next == null ? '' : String(next))
                          }
                        />
                      </div>
                      <span>{servingUnitLabel}</span>
                    </div>
                  )}
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
                  {micronutrientRows.length > 0 && (
                    <NutrientGrid
                      variantIndex={0}
                      variant={nutrientVariant}
                      visibleNutrients={micronutrientRows}
                      energyUnit={energyUnit}
                      convertEnergy={convertEnergy}
                      customNutrients={gridCustomNutrients}
                      onUpdate={updateNutrient}
                      onRemove={removeNutrient}
                    />
                  )}
                  {/* Its own block, in label order, rather than five rows interleaved
                      with the vitamins. The set is fixed, so it has no remove handler:
                      the checkbox is how you get rid of it. */}
                  {includeMacros && (
                    <div className="rounded-md border border-dashed p-3">
                      {/* Hand laid out rather than NutrientGrid: that grid caps at four
                          columns with full nutrient names, which wrapped these five onto
                          two rows and two lines of label each. A fixed set gets a fixed
                          row, with the unit carried by the placeholder. */}
                      <div className="grid grid-cols-5 gap-2">
                        {MACRO_PICKER_FIELDS.map((field) => {
                          const key = field.fieldKey as string;
                          const isCalories = key === 'calories';
                          const raw =
                            nutrientVariant[
                              key as keyof typeof nutrientVariant
                            ];
                          const value =
                            typeof raw === 'number'
                              ? isCalories
                                ? Math.round(
                                    convertEnergy(raw, 'kcal', energyUnit)
                                  )
                                : raw
                              : undefined;
                          return (
                            <div key={key} className="flex flex-col gap-1">
                              <Label
                                htmlFor={`macro-${key}`}
                                className="text-xs"
                              >
                                {t(
                                  `medications.cabinet.macroLabel_${key}`,
                                  field.shortLabel
                                )}
                              </Label>
                              <NumericInput
                                id={`macro-${key}`}
                                min="0"
                                step={isCalories ? '1' : '0.1'}
                                decimals={isCalories ? 0 : 1}
                                value={value}
                                placeholder={
                                  isCalories ? energyUnit : field.unit
                                }
                                onValueChange={(next) =>
                                  updateNutrient(0, key, next)
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <NutrientPicker
                      selected={selectedNutrients}
                      customNutrients={gridCustomNutrients}
                      onAdd={addNutrients}
                    />
                    <label className="flex shrink-0 items-center gap-2 text-sm">
                      <Checkbox
                        checked={includeMacros}
                        onCheckedChange={(checked) =>
                          toggleMacros(checked === true)
                        }
                      />
                      {t('medications.cabinet.includeMacros', 'Include macros')}
                    </label>
                  </div>
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
