import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import {
  useNutrientGoalPreferences,
  useUpdateNutrientGoalPreferenceMutation,
  useResetNutrientGoalPreferenceMutation,
} from '@/hooks/Settings/useNutrientGoalPreferences';
import {
  CENTRAL_NUTRIENT_CONFIG,
  PREDEFINED_NUTRIENT_KEYS,
  NutrientGoalType,
} from '@/constants/nutrients';
import { RotateCcw, Info, ChevronDown } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';

// Nutrients whose "right" direction genuinely depends on the user's personal
// goal (unlike sodium/cholesterol/etc., which have a medically clear default).
// These get an inline info popover so we never silently imply the default is
// the correct choice for everyone. Keyed by nutrient id.
const GOAL_DEPENDENT_HINTS: Record<
  string,
  { key: string; defaultValue: string }
> = {
  calories: {
    key: 'nutrientGoalDirection.hints.calories',
    defaultValue:
      'Depends on your goal: Maximum (or Range) to lose weight, Minimum to gain, Range to maintain.',
  },
  carbs: {
    key: 'nutrientGoalDirection.hints.carbs',
    defaultValue:
      'Often Maximum if managing blood sugar (diabetes) or eating low-carb; Minimum if you want to reach a carb target.',
  },
  fat: {
    key: 'nutrientGoalDirection.hints.fat',
    defaultValue:
      'Usually Minimum (a target to reach); choose Maximum if you are limiting total fat.',
  },
};

// Common health scenarios shown in the collapsible "Which should I choose?"
// helper, so users pick a direction based on what they're trying to do
// rather than defaulting blindly.
const GUIDANCE_SCENARIOS: {
  titleKey: string;
  defaultTitle: string;
  bodyKey: string;
  defaultBody: string;
}[] = [
  {
    titleKey: 'nutrientGoalDirection.guidance.loseWeight.title',
    defaultTitle: 'Losing weight',
    bodyKey: 'nutrientGoalDirection.guidance.loseWeight.body',
    defaultBody: 'Set Calories to Maximum (a ceiling) or a Target range.',
  },
  {
    titleKey: 'nutrientGoalDirection.guidance.gainWeight.title',
    defaultTitle: 'Gaining weight or building muscle',
    bodyKey: 'nutrientGoalDirection.guidance.gainWeight.body',
    defaultBody: 'Set Calories and Protein to Minimum (a floor to reach).',
  },
  {
    titleKey: 'nutrientGoalDirection.guidance.maintain.title',
    defaultTitle: 'Maintaining weight',
    bodyKey: 'nutrientGoalDirection.guidance.maintain.body',
    defaultBody:
      'Set Calories to a Target range around your maintenance level.',
  },
  {
    titleKey: 'nutrientGoalDirection.guidance.diabetes.title',
    defaultTitle: 'Managing blood sugar (diabetes)',
    bodyKey: 'nutrientGoalDirection.guidance.diabetes.body',
    defaultBody: 'Set Carbohydrates and Sugars to Maximum.',
  },
  {
    titleKey: 'nutrientGoalDirection.guidance.heart.title',
    defaultTitle: 'High cholesterol or heart health',
    bodyKey: 'nutrientGoalDirection.guidance.heart.body',
    defaultBody:
      'Keep Cholesterol, Saturated fat, and Sodium as Maximum (the defaults).',
  },
  {
    titleKey: 'nutrientGoalDirection.guidance.lowCarb.title',
    defaultTitle: 'Low-carb or keto',
    bodyKey: 'nutrientGoalDirection.guidance.lowCarb.body',
    defaultBody:
      'Set Carbohydrates to Maximum; keep Fat and Protein as Minimum.',
  },
];

function getNutrientLabel(
  key: string,
  t: (key: string, defaultValue: string) => string
) {
  const config = CENTRAL_NUTRIENT_CONFIG[key];
  if (config) return t(config.label, config.defaultLabel);
  return key;
}

// Purely a display grouping for this settings screen — breaks the flat list
// of ~17 predefined nutrients into scannable sections. Falls back to an
// "Other" bucket for any predefined key not explicitly placed here, so a
// future addition to PREDEFINED_NUTRIENT_KEYS never silently disappears.
const SECTION_DEFINITIONS: {
  titleKey: string;
  defaultTitle: string;
  keys: string[];
}[] = [
  {
    titleKey: 'nutrientGoalDirection.sections.energyMacros',
    defaultTitle: 'Energy & Macros',
    keys: ['calories', 'protein', 'carbs', 'fat'],
  },
  {
    titleKey: 'nutrientGoalDirection.sections.fats',
    defaultTitle: 'Fats',
    keys: [
      'saturated_fat',
      'polyunsaturated_fat',
      'monounsaturated_fat',
      'trans_fat',
      'cholesterol',
    ],
  },
  {
    titleKey: 'nutrientGoalDirection.sections.minerals',
    defaultTitle: 'Minerals',
    keys: ['sodium', 'potassium', 'calcium', 'iron'],
  },
  {
    titleKey: 'nutrientGoalDirection.sections.fiberSugar',
    defaultTitle: 'Fiber & Sugar',
    keys: ['dietary_fiber', 'sugars'],
  },
  {
    titleKey: 'nutrientGoalDirection.sections.vitamins',
    defaultTitle: 'Vitamins',
    keys: ['vitamin_a', 'vitamin_c'],
  },
];

const GOAL_TYPE_OPTIONS: {
  value: NutrientGoalType;
  labelKey: string;
  defaultLabel: string;
  descriptionKey: string;
  defaultDescription: string;
  activeClassName: string;
  dotClassName: string;
}[] = [
  {
    value: 'minimum',
    labelKey: 'nutrientGoalDirection.badgeMin',
    defaultLabel: 'Min',
    descriptionKey: 'nutrientGoalDirection.minimumDescription',
    defaultDescription: 'More is better — progress fills toward the goal',
    activeClassName:
      'bg-slate-200 text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-50',
    dotClassName: 'bg-slate-400',
  },
  {
    value: 'maximum',
    labelKey: 'nutrientGoalDirection.badgeMax',
    defaultLabel: 'Max',
    descriptionKey: 'nutrientGoalDirection.maximumDescription',
    defaultDescription: 'Less is better — stay at or under the goal',
    activeClassName:
      'bg-amber-200 text-amber-900 shadow-sm dark:bg-amber-800 dark:text-amber-50',
    dotClassName: 'bg-amber-400',
  },
  {
    value: 'target',
    labelKey: 'nutrientGoalDirection.badgeTarget',
    defaultLabel: 'Range',
    descriptionKey: 'nutrientGoalDirection.targetDescription',
    defaultDescription: 'Hit a band between a minimum and a maximum',
    activeClassName:
      'bg-blue-200 text-blue-900 shadow-sm dark:bg-blue-800 dark:text-blue-50',
    dotClassName: 'bg-blue-400',
  },
];

const NutrientGoalDirectionLegend = () => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {GOAL_TYPE_OPTIONS.map((opt) => (
        <span key={opt.value} className="inline-flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', opt.dotClassName)} />
          <strong className="font-medium text-foreground">
            {t(opt.labelKey, opt.defaultLabel)}
          </strong>
          <span>{t(opt.descriptionKey, opt.defaultDescription)}</span>
        </span>
      ))}
    </div>
  );
};

const NutrientGoalDirectionGuidance = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border bg-blue-50/50 dark:bg-blue-950/20"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-blue-700 dark:text-blue-300"
        >
          <Info className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {t(
              'nutrientGoalDirection.guidance.title',
              'Not sure which to choose? It depends on your goal'
            )}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 pt-1">
          <p className="mb-2 text-xs text-muted-foreground">
            {t(
              'nutrientGoalDirection.guidance.intro',
              'These are only display directions — they change how progress is judged, not your goal numbers. Pick what fits what you are trying to do:'
            )}
          </p>
          <dl className="grid gap-2 sm:grid-cols-2">
            {GUIDANCE_SCENARIOS.map((s) => (
              <div
                key={s.titleKey}
                className="rounded-md bg-background/60 px-3 py-2"
              >
                <dt className="text-xs font-semibold text-foreground">
                  {t(s.titleKey, s.defaultTitle)}
                </dt>
                <dd className="text-xs text-muted-foreground">
                  {t(s.bodyKey, s.defaultBody)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

interface NutrientGoalDirectionRowProps {
  nutrientKey: string;
  unit: string;
  goalType: NutrientGoalType;
  targetMin?: number;
  targetMax?: number;
  // The nutrient's built-in direction (e.g. 'maximum' for sodium, 'minimum'
  // for most others) — distinct from `goalType`, which is the *current
  // effective* direction (a saved override, if any). Reset always goes to
  // this, not to `goalType`.
  builtinDefaultGoalType: NutrientGoalType;
}

const NutrientGoalDirectionRow = ({
  nutrientKey,
  unit,
  goalType,
  targetMin,
  targetMax,
  builtinDefaultGoalType,
}: NutrientGoalDirectionRowProps) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy } = usePreferences();
  const { mutate: updatePreference } =
    useUpdateNutrientGoalPreferenceMutation();
  const { mutate: resetPreference } = useResetNutrientGoalPreferenceMutation();

  const isCalories = nutrientKey === 'calories';

  // If isCalories and energyUnit is kJ, convert targetMin/targetMax from kcal to kJ for display
  const initialMin =
    targetMin !== undefined
      ? isCalories
        ? Math.round(convertEnergy(targetMin, 'kcal', energyUnit))
        : targetMin
      : undefined;

  const initialMax =
    targetMax !== undefined
      ? isCalories
        ? Math.round(convertEnergy(targetMax, 'kcal', energyUnit))
        : targetMax
      : undefined;

  // The Select is driven by this local, uncommitted selection rather than
  // directly by the saved `goalType` prop: choosing "Target range" has
  // nothing to persist yet (the band is empty), so if the Select were bound
  // straight to the prop it would silently snap back since the mutation
  // never fires. Local state lets the dropdown reflect the choice immediately
  // and reveal the band inputs. The parent remounts this row (via a key that
  // includes goalType/targetMin/targetMax) whenever the saved preference
  // actually changes, so these initializers stay in sync with the server
  // without needing an effect to resync them.
  const [localGoalType, setLocalGoalType] =
    useState<NutrientGoalType>(goalType);
  const [localMin, setLocalMin] = useState<string>(
    initialMin !== undefined ? String(initialMin) : ''
  );
  const [localMax, setLocalMax] = useState<string>(
    initialMax !== undefined ? String(initialMax) : ''
  );

  const handleGoalTypeChange = (value: NutrientGoalType) => {
    setLocalGoalType(value);
    if (value === 'target') {
      const min = parseFloat(localMin);
      const max = parseFloat(localMax);
      if (isNaN(min) || isNaN(max) || min > max) {
        // Show the band inputs and wait for the user to fill in a valid
        // range before saving — nothing to persist yet.
        return;
      }
      const dbMin = isCalories ? convertEnergy(min, energyUnit, 'kcal') : min;
      const dbMax = isCalories ? convertEnergy(max, energyUnit, 'kcal') : max;
      updatePreference({
        nutrientKey,
        goalType: 'target',
        targetMin: dbMin,
        targetMax: dbMax,
      });
    } else {
      updatePreference({ nutrientKey, goalType: value });
    }
  };

  const handleBandSave = () => {
    const min = parseFloat(localMin);
    const max = parseFloat(localMax);
    if (isNaN(min) || isNaN(max) || min > max) return;
    const dbMin = isCalories ? convertEnergy(min, energyUnit, 'kcal') : min;
    const dbMax = isCalories ? convertEnergy(max, energyUnit, 'kcal') : max;
    updatePreference({
      nutrientKey,
      goalType: 'target',
      targetMin: dbMin,
      targetMax: dbMax,
    });
  };

  // Always snaps the row back to the nutrient's built-in direction — both
  // locally (so an uncommitted, never-saved selection like an empty "Range"
  // picker visibly resets too) and on the server (deleting any saved
  // override, if one exists). Relying on the server round-trip alone was the
  // bug: if the user had only made a local, unsaved selection, there was
  // nothing to delete, so nothing appeared to happen.
  const handleReset = () => {
    setLocalGoalType(builtinDefaultGoalType);
    setLocalMin('');
    setLocalMax('');
    resetPreference(nutrientKey);
  };

  const bandInvalid =
    localGoalType === 'target' &&
    (localMin === '' ||
      localMax === '' ||
      isNaN(parseFloat(localMin)) ||
      isNaN(parseFloat(localMax)) ||
      parseFloat(localMin) > parseFloat(localMax));

  const displayUnit = isCalories
    ? energyUnit === 'kcal'
      ? t('common.kcalUnit', 'kcal')
      : t('common.kJUnit', 'kJ')
    : unit;

  const hint = GOAL_DEPENDENT_HINTS[nutrientKey];

  return (
    <div className="rounded-lg border p-3 space-y-2 hover:bg-muted/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <Label className="truncate min-w-0">
            {getNutrientLabel(nutrientKey, t)}
          </Label>
          {hint && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 text-blue-500 hover:text-blue-600 dark:text-blue-400"
                  aria-label={t(
                    'nutrientGoalDirection.whyDependsLabel',
                    'Why this depends on your goal'
                  )}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 text-xs leading-relaxed">
                {t(hint.key, hint.defaultValue)}
              </PopoverContent>
            </Popover>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0"
          title={t('nutrientGoalDirection.resetToDefault', 'Reset to default')}
          aria-label={t(
            'nutrientGoalDirection.resetToDefault',
            'Reset to default'
          )}
          onClick={handleReset}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div
        role="group"
        aria-label={t(
          'nutrientGoalDirection.goalTypeGroupLabel',
          'Goal direction'
        )}
        className="grid grid-cols-3 gap-0.5 rounded-md border bg-muted/40 p-0.5"
      >
        {GOAL_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={localGoalType === opt.value}
            title={t(opt.descriptionKey, opt.defaultDescription)}
            onClick={() => handleGoalTypeChange(opt.value)}
            className={cn(
              'h-7 rounded-sm text-xs font-medium transition-colors',
              localGoalType === opt.value
                ? opt.activeClassName
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t(opt.labelKey, opt.defaultLabel)}
          </button>
        ))}
      </div>

      {localGoalType === 'target' && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-20 shrink-0">
            <Input
              type="number"
              className="h-8 text-sm"
              placeholder={t('nutrientGoalDirection.min', 'Min')}
              value={localMin}
              onChange={(e) => setLocalMin(e.target.value)}
              onBlur={handleBandSave}
            />
          </div>
          <span className="text-muted-foreground text-sm shrink-0">
            {t('nutrientGoalDirection.to', 'to')}
          </span>
          <div className="w-20 shrink-0">
            <Input
              type="number"
              className="h-8 text-sm"
              placeholder={t('nutrientGoalDirection.max', 'Max')}
              value={localMax}
              onChange={(e) => setLocalMax(e.target.value)}
              onBlur={handleBandSave}
            />
          </div>
          <span className="text-sm text-muted-foreground shrink-0">
            {displayUnit}
          </span>
        </div>
      )}

      {bandInvalid && (
        <span className="text-xs text-destructive">
          {t('nutrientGoalDirection.invalidBand', 'Enter a valid min ≤ max')}
        </span>
      )}
    </div>
  );
};

interface NutrientSectionProps {
  title: string;
  keys: string[];
  goalPreferences: ReturnType<typeof useNutrientGoalPreferences>['data'];
  customNutrients: ReturnType<typeof useCustomNutrients>['data'];
  energyUnit: string;
  // Bumped by "Reset All" to force every row to remount — including ones
  // with only a local, never-saved selection, which wouldn't otherwise pick
  // up a change since nothing in `goalPreferences` actually changed for them.
  resetEpoch: number;
}

const NutrientSection = ({
  title,
  keys,
  goalPreferences,
  customNutrients,
  energyUnit,
  resetEpoch,
}: NutrientSectionProps) => {
  if (keys.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 px-1">
        {title}
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {keys.map((key) => {
          const unit =
            CENTRAL_NUTRIENT_CONFIG[key]?.unit ??
            customNutrients?.find((cn) => cn.name === key)?.unit ??
            '';
          const preference = goalPreferences?.[key];
          const builtinDefaultGoalType: NutrientGoalType =
            CENTRAL_NUTRIENT_CONFIG[key]?.defaultGoalType ?? 'minimum';
          const goalType: NutrientGoalType =
            preference?.goalType ?? builtinDefaultGoalType;
          return (
            <NutrientGoalDirectionRow
              key={`${key}-${goalType}-${preference?.targetMin}-${preference?.targetMax}-${energyUnit}-${resetEpoch}`}
              nutrientKey={key}
              unit={unit}
              goalType={goalType}
              targetMin={preference?.targetMin}
              targetMax={preference?.targetMax}
              builtinDefaultGoalType={builtinDefaultGoalType}
            />
          );
        })}
      </div>
    </div>
  );
};

const NutrientGoalDirectionSettings = () => {
  const { t } = useTranslation();
  const { energyUnit } = usePreferences();
  const { data: customNutrients = [] } = useCustomNutrients();
  const { data: goalPreferences = {} } = useNutrientGoalPreferences();
  const { mutate: resetPreference } = useResetNutrientGoalPreferenceMutation();
  const [resetEpoch, setResetEpoch] = useState(0);

  const sections = useMemo(() => {
    const placed = new Set(SECTION_DEFINITIONS.flatMap((s) => s.keys));
    const other = PREDEFINED_NUTRIENT_KEYS.filter((k) => !placed.has(k));
    return [
      ...SECTION_DEFINITIONS,
      ...(other.length > 0
        ? [
            {
              titleKey: 'nutrientGoalDirection.sections.other',
              defaultTitle: 'Other',
              keys: other,
            },
          ]
        : []),
      {
        titleKey: 'nutrientGoalDirection.sections.custom',
        defaultTitle: 'Custom Nutrients',
        keys: customNutrients.map((cn) => cn.name),
      },
    ];
  }, [customNutrients]);

  const overriddenCount = Object.keys(goalPreferences ?? {}).length;

  const handleResetAll = () => {
    Object.keys(goalPreferences ?? {}).forEach((key) => resetPreference(key));
    // Forces every row to remount from its built-in default immediately,
    // rather than waiting on each individual DELETE + refetch to resolve —
    // and also catches rows with only a local, never-saved selection.
    setResetEpoch((epoch) => epoch + 1);
  };

  return (
    <div className="space-y-5">
      <NutrientGoalDirectionGuidance />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NutrientGoalDirectionLegend />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={overriddenCount === 0}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              {t('nutrientGoalDirection.resetAll', 'Reset All')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t(
                  'nutrientGoalDirection.resetAllConfirmTitle',
                  'Reset all nutrient goal directions?'
                )}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t(
                  'nutrientGoalDirection.resetAllConfirmDescription',
                  'Every nutrient below will go back to its built-in Min/Max direction. This only affects how progress is displayed — your goal values themselves are unchanged.'
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t('common.cancel', 'Cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleResetAll}>
                {t('nutrientGoalDirection.resetAll', 'Reset All')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {sections.map((section) => (
        <NutrientSection
          key={section.titleKey}
          title={t(section.titleKey, section.defaultTitle)}
          keys={section.keys}
          goalPreferences={goalPreferences}
          customNutrients={customNutrients}
          energyUnit={energyUnit}
          resetEpoch={resetEpoch}
        />
      ))}
    </div>
  );
};

export default NutrientGoalDirectionSettings;
