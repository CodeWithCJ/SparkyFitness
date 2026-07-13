import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Copy, Trash2, Check, Plus, X, Sparkles } from 'lucide-react';
import type { EquivalentUnit, GlycemicIndex } from '@/types/food';
import type { FormFoodVariant } from '@/utils/foodForm';
import {
  CONFIDENCE_TONES,
  OVERALL_CONFIDENCE_LABELS,
  shouldOfferAiConversion,
  type AiConfidence,
  type ConfidenceTone,
} from '@workspace/shared';
import { UNIT_GROUPS } from '@/constants/foodForm';
import { UserCustomNutrient } from '@/types/customNutrient';
import { NutrientGrid } from './NutrientFormGrid';
import { AiEstimateSection } from '@/components/FoodUnitSelector/AiEstimateSection';
import type { AiEstimateData } from '@/hooks/Foods/useUnitConversion';
import { NumericInput } from '../NumericInput';
import { formatServingLabel } from '@/utils/foodServing';

// Tone classes for the AI provenance badge ("Good/Fair/Rough estimate").
// `green` (true grass-green, hue ~142°) replaces `emerald` (~160°,
// teal-leaning) so "Good" reads as a standard success color, not mint.
const AI_BADGE_TONE_CLASSES: Record<ConfidenceTone, string> = {
  success: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  error: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};

// Vivid `-500/-400` icon shade in the same hue family as the badge text.
// A thin dropdown sparkle at the badge's muted `-700/-300` reads as
// washed-out mint/sage; the brighter `-500/-400` makes the sparkle pop as
// grass-green / amber / rose while still belonging to the same color family
// as the "Good/Fair/Rough estimate" pill.
const AI_SPARKLE_TONE_CLASSES: Record<ConfidenceTone, string> = {
  success: 'text-green-500 dark:text-green-400',
  warning: 'text-amber-500 dark:text-amber-400',
  error: 'text-rose-500 dark:text-rose-400',
};

const COMMON_ALLERGENS = [
  'gluten',
  'wheat',
  'milk',
  'eggs',
  'peanuts',
  'tree nuts',
  'soy',
  'fish',
  'shellfish',
  'crustaceans',
  'sesame',
  'celery',
  'mustard',
  'lupin',
  'sulphites',
];

interface VariantCardProps {
  index: number;
  variant: FormFoodVariant & { equivalents?: EquivalentUnit[] };
  variantError: string;
  visibleNutrients: string[];
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    from: 'kcal' | 'kJ',
    to: 'kcal' | 'kJ'
  ) => number;
  customNutrients?: UserCustomNutrient[];
  showCompatibleUnitIndicators: boolean;
  /** Food context for the AI prompt — name + optional brand. id is a sentinel
   *  for unsaved foods (server doesn't look it up). */
  food: { id: string; name: string; brand?: string | null };
  /** The default variant row, used as the AI estimation anchor. */
  defaultVariant: (FormFoodVariant & { equivalents?: EquivalentUnit[] }) | null;
  /** Unit of the variant that AI will estimate FROM for this row. Computed by
   *  the parent so we can support both the "non-default row anchored on default"
   *  case and the "default row whose unit was just swapped" case in one prop.
   *  Null when this row has no valid anchor (AI button is hidden). */
  aiEstimateAnchorUnit: string | null;
  /** Combined gate: admin allows user AI config + active AI service exists +
   *  per-user preference is on. */
  aiEstimatesAvailable: boolean;
  /** Units that already have a SAVED AI variant on this food (any row).
   *  Drives the inline AI sparkle in the dropdown — when a unit option here
   *  matches a saved AI variant's `serving_unit`, the sparkle renders on
   *  THAT option in every row's dropdown (e.g. opening the default `g`
   *  row's dropdown still shows the sparkle on the `cup` option because
   *  another row saved `cup` as an AI variant). Fresh in-form AI estimates
   *  intentionally don't appear here until the user commits via Save Food. */
  savedAiUnits?: ReadonlyArray<{ unit: string; confidence: AiConfidence }>;
  /** The unit this row currently has a real AI estimate for. Badge visibility
   *  is tied to this exact unit, not just the row carrying AI provenance. */
  aiEstimatedUnit: string | null;
  compatibleUnits: ReadonlyArray<string>;
  /** Apply an accepted AI estimate to this row. Caller scales the default
   *  variant's nutrition and stamps provenance on the row. */
  onApplyAiEstimate: (index: number, estimate: AiEstimateData) => void;
  onUpdate: (
    index: number,
    field: string,
    value:
      | string
      | number
      | boolean
      | undefined
      | GlycemicIndex
      | EquivalentUnit[]
      | string[]
  ) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
}

export function VariantCard({
  index,
  variant,
  variantError,
  visibleNutrients,
  energyUnit,
  convertEnergy,
  customNutrients,
  showCompatibleUnitIndicators,
  food,
  defaultVariant: _defaultVariant,
  aiEstimateAnchorUnit,
  aiEstimatesAvailable,
  savedAiUnits,
  aiEstimatedUnit,
  compatibleUnits,
  onApplyAiEstimate,
  onUpdate,
  onDuplicate,
  onRemove,
}: VariantCardProps) {
  const equivalents = useMemo(
    () => variant.equivalents ?? [],
    [variant.equivalents]
  );
  const [allergenInput, setAllergenInput] = useState('');

  const customUnitsForDropdown = useMemo(() => {
    const standardUnits = new Set(UNIT_GROUPS.flatMap((group) => group.units));
    const custom = new Set<string>();

    const checkAndAdd = (unit: string | undefined | null) => {
      if (unit && !standardUnits.has(unit)) {
        custom.add(unit);
      }
    };

    checkAndAdd(variant.serving_unit);
    equivalents.forEach((eq) => checkAndAdd(eq.serving_unit));

    if (_defaultVariant) {
      checkAndAdd(_defaultVariant.serving_unit);
      _defaultVariant.equivalents?.forEach((eq) =>
        checkAndAdd(eq.serving_unit)
      );
    }

    return Array.from(custom);
  }, [variant.serving_unit, equivalents, _defaultVariant]);

  const currentAllergens: string[] = variant.allergens ?? [];

  const addAllergen = (name: string) => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed || currentAllergens.includes(trimmed)) return;
    onUpdate(index, 'allergens', [...currentAllergens, trimmed]);
    setAllergenInput('');
  };

  const removeAllergen = (name: string) => {
    onUpdate(
      index,
      'allergens',
      currentAllergens.filter((a) => a !== name)
    );
  };

  // Per-row AI gate. The anchor is supplied by the parent (defaults to the
  // food's default variant, or the row's previous state when the user just
  // swapped THIS row's unit to an incompatible one). Button shows whenever
  // both sides are AI-convertible standard units that are cross-category
  // incompatible — same rule as the diary picker, applied per-row here.
  // AI estimates the row's actual quantity (whatever number the user has typed)
  // so the result corresponds to what they see in the row — same mental model
  // as auto-convert. Anything ≤ 0 hides the button so we don't ask AI to convert
  // a meaningless serving size.
  const aiFromAmount = Number(variant.serving_size);
  const showAiEstimateButton =
    aiEstimatesAvailable &&
    !!aiEstimateAnchorUnit &&
    aiEstimateAnchorUnit.length > 0 &&
    variant.serving_unit.length > 0 &&
    !compatibleUnits.includes(variant.serving_unit) &&
    food.name.trim().length > 0 &&
    Number.isFinite(aiFromAmount) &&
    aiFromAmount > 0 &&
    shouldOfferAiConversion(aiEstimateAnchorUnit, variant.serving_unit);
  const isAiSourced = variant.source === 'ai_estimate';
  const showAiEstimateBadge =
    isAiSourced &&
    !!variant.ai_confidence &&
    aiEstimatedUnit !== null &&
    variant.serving_unit === aiEstimatedUnit;

  const addEquivalent = () => {
    onUpdate(index, 'equivalents', [
      ...equivalents,
      { serving_size: 1, serving_unit: '' },
    ]);
  };

  const updateEquivalent = (
    eqIndex: number,
    field: keyof EquivalentUnit,
    value: string | number
  ) => {
    const updated = [...equivalents];
    updated[eqIndex] = {
      ...updated[eqIndex],
      [field]: value,
    } as EquivalentUnit;
    onUpdate(index, 'equivalents', updated);
  };

  const removeEquivalent = (eqIndex: number) => {
    const updated = equivalents.filter((_, i) => i !== eqIndex);
    onUpdate(index, 'equivalents', updated);
  };

  return (
    <Card key={index} className="p-4">
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-wrap">
          <div className="flex items-end gap-2">
            <div className="flex flex-col">
              <Label htmlFor={`serving-size-${index}`}>Serving Size</Label>
              <NumericInput
                id={`serving-size-${index}`}
                step="any"
                value={
                  variant.serving_size !== undefined
                    ? variant.serving_size
                    : undefined
                }
                decimals={2}
                onValueChange={(value) =>
                  onUpdate(index, 'serving_size', value)
                }
                className="w-24"
              />
            </div>

            <div className="flex flex-col">
              <Label htmlFor={`serving-unit-${index}`}>Unit Type</Label>
              <Select
                value={variant.serving_unit}
                onValueChange={(value) =>
                  onUpdate(index, 'serving_unit', value)
                }
              >
                <SelectTrigger id={`serving-unit-${index}`} className="w-32">
                  {/* Render only the unit text in the trigger — never the
                      AI indicator. AI provenance lives in the dropdown items
                      and the "Nutrition per X Y" header badge. */}
                  <SelectValue>{variant.serving_unit}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {UNIT_GROUPS.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.units.map((unit) => {
                        const compatible =
                          showCompatibleUnitIndicators &&
                          compatibleUnits.includes(unit);
                        const matchedAi = savedAiUnits?.find(
                          (entry) => entry.unit === unit
                        );
                        const showCompatibilityCheck = compatible && !matchedAi;
                        return (
                          <SelectItem key={unit} value={unit}>
                            <span className="flex items-center gap-1.5">
                              {unit}
                              {showCompatibilityCheck && (
                                <Check
                                  data-testid={`compatible-unit-option-${index}-${unit}`}
                                  className="h-3 w-3 text-green-500"
                                />
                              )}
                              {matchedAi && (
                                <Sparkles
                                  data-testid={`ai-unit-option-indicator-${index}-${unit}`}
                                  className={`h-3 w-3 ${AI_SPARKLE_TONE_CLASSES[CONFIDENCE_TONES[matchedAi.confidence]]}`}
                                  aria-label={`AI estimate (${OVERALL_CONFIDENCE_LABELS[matchedAi.confidence]} confidence)`}
                                  fill="currentColor"
                                  strokeWidth={0.75}
                                />
                              )}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  ))}
                  {customUnitsForDropdown.length > 0 && (
                    <SelectGroup key="custom-units">
                      <SelectLabel>Custom</SelectLabel>
                      {customUnitsForDropdown.map((unit) => {
                        const compatible =
                          showCompatibleUnitIndicators &&
                          compatibleUnits.includes(unit);
                        const matchedAi = savedAiUnits?.find(
                          (entry) => entry.unit === unit
                        );
                        const showCompatibilityCheck = compatible && !matchedAi;
                        return (
                          <SelectItem key={unit} value={unit}>
                            <span className="flex items-center gap-1.5">
                              {unit}
                              {showCompatibilityCheck && (
                                <Check
                                  data-testid={`compatible-unit-option-${index}-${unit}`}
                                  className="h-3 w-3 text-green-500"
                                />
                              )}
                              {matchedAi && (
                                <Sparkles
                                  data-testid={`ai-unit-option-indicator-${index}-${unit}`}
                                  className={`h-3 w-3 ${AI_SPARKLE_TONE_CLASSES[CONFIDENCE_TONES[matchedAi.confidence]]}`}
                                  aria-label={`AI estimate (${OVERALL_CONFIDENCE_LABELS[matchedAi.confidence]} confidence)`}
                                  fill="currentColor"
                                  strokeWidth={0.75}
                                />
                              )}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {variantError && (
            <p className="text-red-500 text-sm mt-1">{variantError}</p>
          )}

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center space-x-2">
              <Input
                type="checkbox"
                id={`is-default-${index}`}
                checked={variant.is_default ?? false}
                onChange={(e) =>
                  onUpdate(index, 'is_default', e.target.checked)
                }
                className="form-checkbox h-4 w-4 text-blue-600"
              />
              <Label htmlFor={`is-default-${index}`} className="text-sm">
                Default
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Input
                type="checkbox"
                id={`is-locked-${index}`}
                checked={variant.is_locked ?? false}
                onChange={(e) => onUpdate(index, 'is_locked', e.target.checked)}
                className="form-checkbox h-4 w-4 text-blue-600"
              />
              <Label htmlFor={`is-locked-${index}`} className="text-sm">
                Auto-Scale
              </Label>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto m:ml-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addEquivalent}
              title="Add Equivalent Unit"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDuplicate(index)}
              title="Duplicate Unit"
            >
              <Copy className="w-4 h-4" />
            </Button>
            {index > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemove(index)}
                title="Remove Unit"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {equivalents.map((eq, eqIndex) => (
          <div key={eqIndex} className="flex items-end gap-2 ">
            <div className="flex flex-col">
              <Label htmlFor={`eq-size-${index}-${eqIndex}`}>
                Equivalent Size
              </Label>
              <Input
                id={`eq-size-${index}-${eqIndex}`}
                type="number"
                step="any"
                value={eq.serving_size}
                onChange={(e) =>
                  updateEquivalent(
                    eqIndex,
                    'serving_size',
                    Number(e.target.value)
                  )
                }
                className="w-24"
              />
            </div>
            <div className="flex flex-col">
              <Label htmlFor={`eq-unit-${index}-${eqIndex}`}>Unit Type</Label>
              <Select
                value={eq.serving_unit}
                onValueChange={(value) =>
                  updateEquivalent(eqIndex, 'serving_unit', value)
                }
              >
                <SelectTrigger
                  id={`eq-unit-${index}-${eqIndex}`}
                  className="w-32"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_GROUPS.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.units.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  {customUnitsForDropdown.length > 0 && (
                    <SelectGroup key="custom-units">
                      <SelectLabel>Custom</SelectLabel>
                      {customUnitsForDropdown.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeEquivalent(eqIndex)}
              title="Remove Equivalent"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      {showAiEstimateButton && aiEstimateAnchorUnit && (
        <div className="mb-4">
          <AiEstimateSection
            food={{ id: food.id, name: food.name, brand: food.brand }}
            fromUnit={variant.serving_unit}
            fromAmount={aiFromAmount}
            toUnit={aiEstimateAnchorUnit}
            knownVariants={[{ amount: 1, unit: aiEstimateAnchorUnit }]}
            mode="auto-apply"
            onAccept={(estimate) => onApplyAiEstimate(index, estimate)}
          />
        </div>
      )}

      <h4 className="text-md font-medium mb-2 flex items-center gap-2">
        <span>Nutrition per {formatServingLabel(variant)}</span>
        {showAiEstimateBadge && (
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${AI_BADGE_TONE_CLASSES[CONFIDENCE_TONES[variant.ai_confidence as AiConfidence]]}`}
            aria-label={`AI estimate (${OVERALL_CONFIDENCE_LABELS[variant.ai_confidence as AiConfidence]} confidence)`}
          >
            {OVERALL_CONFIDENCE_LABELS[variant.ai_confidence as AiConfidence]}{' '}
            estimate
          </span>
        )}
      </h4>

      {/* Pass the array straight through */}
      <NutrientGrid
        variantIndex={index}
        variant={variant}
        visibleNutrients={visibleNutrients}
        energyUnit={energyUnit}
        convertEnergy={convertEnergy}
        customNutrients={customNutrients}
        onUpdate={onUpdate}
      />

      <div className="mt-4 space-y-2">
        <Label>Allergens</Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {COMMON_ALLERGENS.map((a) => (
            <Badge
              key={a}
              variant={currentAllergens.includes(a) ? 'default' : 'outline'}
              className={`cursor-pointer capitalize select-none text-xs ${currentAllergens.includes(a) ? 'opacity-60' : 'hover:bg-accent'}`}
              onClick={() =>
                currentAllergens.includes(a)
                  ? removeAllergen(a)
                  : addAllergen(a)
              }
            >
              {currentAllergens.includes(a) && <X className="h-3 w-3 mr-1" />}
              {a}
            </Badge>
          ))}
        </div>
        {currentAllergens.filter((a) => !COMMON_ALLERGENS.includes(a)).length >
          0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {currentAllergens
              .filter((a) => !COMMON_ALLERGENS.includes(a))
              .map((a) => (
                <Badge
                  key={a}
                  variant="secondary"
                  className="capitalize text-xs cursor-pointer"
                  onClick={() => removeAllergen(a)}
                >
                  <X className="h-3 w-3 mr-1" />
                  {a}
                </Badge>
              ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={allergenInput}
            onChange={(e) => setAllergenInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addAllergen(allergenInput);
              }
            }}
            placeholder="Custom allergen…"
            className="max-w-xs h-8 text-sm"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => addAllergen(allergenInput)}
            disabled={!allergenInput.trim()}
          >
            Add
          </Button>
        </div>
      </div>
    </Card>
  );
}
