import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Sparkles, Clock, CalendarDays } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info, warn, error } from '@/utils/logging';
import type { Food, FoodVariant } from '@/types/food';
import { useQueryClient } from '@tanstack/react-query';
import {
  foodVariantsOptions,
  useCreateFoodVariantMutation,
} from '@/hooks/Foods/useFoodVariants';
import {
  canAutoConvertToUnit,
  useUnitConversion,
} from '@/hooks/Foods/useUnitConversion';
import { useActiveAIService } from '@/hooks/AI/useAIServiceSettings';
import { useUserAiConfigAllowed } from '@/hooks/AI/useUserAiConfigAllowed';
import {
  CONFIDENCE_TONES,
  OVERALL_CONFIDENCE_LABELS,
  shouldOfferAiConversion,
  userHourMinute,
  defaultMealTypeForTime,
  type AiConfidence,
  type ConfidenceTone,
} from '@workspace/shared';

// Confidence tone classes for the saved-AI-variant indicator in the picker dropdown.
const AI_PICKER_ICON_TONE_CLASSES: Record<ConfidenceTone, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  error: 'text-rose-600 dark:text-rose-400',
};

// Filled-pill version of the same tones for the inline post-estimate badge.
const AI_ESTIMATE_BADGE_TONE_CLASSES: Record<ConfidenceTone, string> = {
  success: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  error: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};
import { AiEstimateSection } from '@/components/FoodUnitSelector/AiEstimateSection';

interface FoodUnitSelectorProps {
  food: Food;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (
    food: Food,
    quantity: number,
    unit: string,
    selectedVariant: FoodVariant,
    entryTime?: string | null,
    mealType?: string | null
  ) => void;
  showUnitSelector?: boolean;
  initialQuantity?: number;
  initialUnit?: string;
  initialVariantId?: string;
  showTimeInput?: boolean;
  initialTime?: string;
  defaultMealTime?: string | null;
  showMealTypeSelect?: boolean;
  availableMealTypes?: Array<{
    id: string;
    name: string;
    default_time?: string | null;
  }>;
}

const FoodUnitSelector = ({
  food,
  open,
  onOpenChange,
  onSelect,
  showUnitSelector,
  initialQuantity,
  initialUnit,
  initialVariantId,
  showTimeInput,
  initialTime,
  defaultMealTime,
  showMealTypeSelect,
  availableMealTypes,
}: FoodUnitSelectorProps) => {
  const {
    loggingLevel,
    energyUnit,
    convertEnergy,
    aiAssistedConversions,
    timezone,
  } = usePreferences();
  debug(loggingLevel, 'FoodUnitSelector component rendered.', { food, open });

  // AI gate re-checked each render so toggling preferences mid-dialog takes effect live.
  const userAiConfigAllowedQuery = useUserAiConfigAllowed();
  const userAiConfigAllowed = userAiConfigAllowedQuery.data === true;
  const activeAiServiceQuery = useActiveAIService(open && userAiConfigAllowed);
  const aiEstimatesAvailable =
    aiAssistedConversions === true &&
    userAiConfigAllowed &&
    !!activeAiServiceQuery.data;

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal' ? 'kcal' : 'kJ';
  };

  const [variants, setVariants] = useState<FoodVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<FoodVariant | null>(
    null
  );
  const [quantity, setQuantity] = useState(1);
  const [entryTime, setEntryTime] = useState('');
  const [mealType, setMealType] = useState('');
  const [loading, setLoading] = useState(false);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      if (initialTime !== undefined) {
        setEntryTime(initialTime || '');
      } else {
        const { hour, minute } = userHourMinute(timezone);
        setEntryTime(
          `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
        );
      }

      if (
        showMealTypeSelect &&
        availableMealTypes &&
        availableMealTypes.length > 0
      ) {
        const nowTime = userHourMinute(timezone);
        const matched = defaultMealTypeForTime(availableMealTypes, nowTime);
        setMealType(matched);
      }
    }
    wasOpenRef.current = open;
    // Initialization must only run on the open transition; initialTime and the
    // other inputs are snapshotted then (a minute-boundary initialTime change
    // while open must not re-trigger).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resolvedDefaultMealTime = (() => {
    if (showMealTypeSelect && availableMealTypes) {
      return (
        availableMealTypes.find(
          (t) => t.name.toLowerCase() === mealType.toLowerCase()
        )?.default_time || null
      );
    }
    return defaultMealTime;
  })();

  const handleSetCurrentTime = () => {
    const { hour, minute } = userHourMinute(timezone);
    setEntryTime(
      `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    );
  };

  const handleSetDefaultTime = () => {
    if (resolvedDefaultMealTime) {
      setEntryTime(resolvedDefaultMealTime.substring(0, 5));
    }
  };

  const queryClient = useQueryClient();
  const createFoodVariantMutation = useCreateFoodVariantMutation();
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const {
    pendingUnit,
    setPendingUnit,
    pendingUnitIsCustom,
    conversionFactor,
    setConversionFactor,
    autoConversionFactor,
    conversionBaseVariant,
    conversionError,
    setConversionError,
    aiEstimateData,
    setAiEstimateData,
    isConverting,
    convertibleUnits,
    dropdownValue,
    buildConvertedVariant,
    handleUnitChange,
    cancelConversion,
    resetConversionState,
  } = useUnitConversion({
    variants,
    selectedVariant,
    onVariantSelect: (_variantId, variant) => {
      setSelectedVariant(variant);
      setQuantity(variant.serving_size);
    },
  });

  const loadVariantsData = useCallback(async () => {
    debug(loggingLevel, 'Loading food variants for food ID:', food?.id);
    setLoading(true);
    try {
      const data = await queryClient.fetchQuery(foodVariantsOptions(food.id));

      const primaryUnit: FoodVariant = {
        id: food.default_variant?.id || food.id,
        serving_size: food.default_variant?.serving_size || 100,
        serving_unit: food.default_variant?.serving_unit || 'g',
        calories: food.default_variant?.calories || 0,
        protein: food.default_variant?.protein || 0,
        carbs: food.default_variant?.carbs || 0,
        fat: food.default_variant?.fat || 0,
        saturated_fat: food.default_variant?.saturated_fat || 0,
        polyunsaturated_fat: food.default_variant?.polyunsaturated_fat || 0,
        monounsaturated_fat: food.default_variant?.monounsaturated_fat || 0,
        trans_fat: food.default_variant?.trans_fat || 0,
        cholesterol: food.default_variant?.cholesterol || 0,
        sodium: food.default_variant?.sodium || 0,
        potassium: food.default_variant?.potassium || 0,
        dietary_fiber: food.default_variant?.dietary_fiber || 0,
        sugars: food.default_variant?.sugars || 0,
        vitamin_a: food.default_variant?.vitamin_a || 0,
        vitamin_c: food.default_variant?.vitamin_c || 0,
        calcium: food.default_variant?.calcium || 0,
        iron: food.default_variant?.iron || 0,
        custom_nutrients: food.default_variant?.custom_nutrients,
        source: food.default_variant?.source,
        ai_confidence: food.default_variant?.ai_confidence,
      };

      let combinedVariants: FoodVariant[] = [primaryUnit];

      if (data && data.length > 0) {
        info(loggingLevel, 'Food variants loaded successfully:', data);
        const variantsFromDb = data.map((variant) => ({
          id: variant.id,
          serving_size: variant.serving_size,
          serving_unit: variant.serving_unit,
          calories: variant.calories || 0,
          protein: variant.protein || 0,
          carbs: variant.carbs || 0,
          fat: variant.fat || 0,
          saturated_fat: variant.saturated_fat || 0,
          polyunsaturated_fat: variant.polyunsaturated_fat || 0,
          monounsaturated_fat: variant.monounsaturated_fat || 0,
          trans_fat: variant.trans_fat || 0,
          cholesterol: variant.cholesterol || 0,
          sodium: variant.sodium || 0,
          potassium: variant.potassium || 0,
          dietary_fiber: variant.dietary_fiber || 0,
          sugars: variant.sugars || 0,
          vitamin_a: variant.vitamin_a || 0,
          vitamin_c: variant.vitamin_c || 0,
          calcium: variant.calcium || 0,
          iron: variant.iron || 0,
          custom_nutrients: variant.custom_nutrients,
          // Preserve AI provenance so the dropdown can badge AI-source variants.
          source: variant.source,
          ai_confidence: variant.ai_confidence,
        }));

        const otherVariants = variantsFromDb.filter(
          (variant) => variant.id !== primaryUnit.id
        );
        combinedVariants = [primaryUnit, ...otherVariants];
      } else {
        info(
          loggingLevel,
          'No additional variants found, using primary food unit only.'
        );
      }

      setVariants(combinedVariants);
      const firstCombinedVariant = combinedVariants[0];
      if (initialVariantId && firstCombinedVariant) {
        const variantToSelect = combinedVariants.find(
          (v) => v.id === initialVariantId
        );
        setSelectedVariant(variantToSelect || firstCombinedVariant);
      } else if (firstCombinedVariant) {
        setSelectedVariant(firstCombinedVariant);
      }
    } catch (err) {
      error(loggingLevel, 'Error loading variants:', err);
      const primaryUnit: FoodVariant = {
        id: food.default_variant?.id || food.id,
        serving_size: food.default_variant?.serving_size || 100,
        serving_unit: food.default_variant?.serving_unit || 'g',
        calories: food.default_variant?.calories || 0,
        protein: food.default_variant?.protein || 0,
        carbs: food.default_variant?.carbs || 0,
        fat: food.default_variant?.fat || 0,
        saturated_fat: food.default_variant?.saturated_fat || 0,
        polyunsaturated_fat: food.default_variant?.polyunsaturated_fat || 0,
        monounsaturated_fat: food.default_variant?.monounsaturated_fat || 0,
        trans_fat: food.default_variant?.trans_fat || 0,
        cholesterol: food.default_variant?.cholesterol || 0,
        sodium: food.default_variant?.sodium || 0,
        potassium: food.default_variant?.potassium || 0,
        dietary_fiber: food.default_variant?.dietary_fiber || 0,
        sugars: food.default_variant?.sugars || 0,
        vitamin_a: food.default_variant?.vitamin_a || 0,
        vitamin_c: food.default_variant?.vitamin_c || 0,
        calcium: food.default_variant?.calcium || 0,
        iron: food.default_variant?.iron || 0,
        custom_nutrients: food.default_variant?.custom_nutrients,
        source: food.default_variant?.source,
        ai_confidence: food.default_variant?.ai_confidence,
      };
      setVariants([primaryUnit]);
      setSelectedVariant(primaryUnit);
    } finally {
      setLoading(false);
    }
  }, [food, queryClient, loggingLevel, initialVariantId]);

  useEffect(() => {
    debug(loggingLevel, 'FoodUnitSelector open/food useEffect triggered.', {
      open,
      food,
      initialQuantity,
      initialUnit,
      initialVariantId,
    });
    if (open && food && food.id) {
      loadVariantsData();
      setQuantity(
        initialQuantity !== undefined
          ? initialQuantity
          : food.default_variant?.serving_size || 1
      );
      resetConversionState();
    }
  }, [
    open,
    food,
    initialQuantity,
    initialUnit,
    initialVariantId,
    initialTime,
    loadVariantsData,
    loggingLevel,
    resetConversionState,
  ]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    debug(loggingLevel, 'Handling submit.');

    if (isConverting) {
      const convertedVariant = buildConvertedVariant();
      if (!convertedVariant) {
        setConversionError(
          'Please enter a valid unit name and conversion factor.'
        );
        return;
      }
      setConversionError('');
      try {
        const savedVariant = await createFoodVariantMutation.mutateAsync({
          foodId: food.id,
          variant: convertedVariant,
        });
        info(loggingLevel, 'Created converted variant:', savedVariant);
        const variantWithId: FoodVariant = {
          ...convertedVariant,
          ...savedVariant,
        };
        onSelect(
          food,
          quantity,
          variantWithId.serving_unit,
          variantWithId,
          entryTime || null,
          showMealTypeSelect ? mealType : null
        );
        onOpenChange(false);
        setQuantity(1);
      } catch (err) {
        error(loggingLevel, 'Error creating converted variant:', err);
        setConversionError('Failed to save the new unit. Please try again.');
      }
      return;
    }

    if (selectedVariant) {
      info(loggingLevel, 'Submitting food selection:', {
        food,
        quantity,
        unit: selectedVariant.serving_unit,
        variantId: selectedVariant.id || undefined,
      });
      onSelect(
        food,
        quantity,
        selectedVariant.serving_unit,
        selectedVariant,
        entryTime || null,
        showMealTypeSelect ? mealType : null
      );
      onOpenChange(false);
      setQuantity(1);
    } else {
      warn(loggingLevel, 'Submit called with no selected variant.');
    }
  };

  // The active variant used for nutrition display
  const activeVariant = isConverting
    ? buildConvertedVariant()
    : selectedVariant;

  const nutrition = (() => {
    if (!activeVariant) return null;
    const ratio = quantity / (activeVariant.serving_size || 1);
    return {
      calories: (activeVariant.calories || 0) * ratio,
      protein: (activeVariant.protein || 0) * ratio,
      carbs: (activeVariant.carbs || 0) * ratio,
      fat: (activeVariant.fat || 0) * ratio,
    };
  })();

  useEffect(() => {
    if (open && quantityInputRef.current) {
      const timeoutId = setTimeout(() => {
        if (quantityInputRef.current) {
          quantityInputRef.current.focus();
          quantityInputRef.current.select();
        }
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [open, loading]);

  const displayUnit = isConverting
    ? pendingUnit.trim() || '?'
    : selectedVariant?.serving_unit || '';

  return (
    <Dialog
      open={open && (showUnitSelector ?? true)}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initialQuantity
              ? `Edit ${food?.name}`
              : `Add ${food?.name} to Meal`}
          </DialogTitle>
          <DialogDescription>
            {initialQuantity
              ? `Edit the quantity and unit for ${food?.name}.`
              : `Select the quantity and unit for your food entry.`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div>Loading units...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    ref={quantityInputRef}
                    id="quantity"
                    type="number"
                    step="any"
                    min="0.01"
                    value={quantity}
                    onChange={(e) => {
                      const newQuantity = Number(e.target.value);
                      debug(loggingLevel, 'Quantity changed:', newQuantity);
                      setQuantity(newQuantity);
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="unit">Unit</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={dropdownValue}
                      onValueChange={handleUnitChange}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {variants.map(
                          (variant) =>
                            variant.id && (
                              <SelectItem key={variant.id} value={variant.id}>
                                <span className="flex items-center gap-1.5">
                                  {variant.serving_unit}
                                  {variant.source === 'ai_estimate' &&
                                    variant.ai_confidence && (
                                      <Sparkles
                                        className={`h-3 w-3 ${AI_PICKER_ICON_TONE_CLASSES[CONFIDENCE_TONES[variant.ai_confidence as AiConfidence]]}`}
                                        aria-label={`AI estimate (${OVERALL_CONFIDENCE_LABELS[variant.ai_confidence as AiConfidence]} confidence)`}
                                      />
                                    )}
                                </span>
                              </SelectItem>
                            )
                        )}
                        {convertibleUnits.length > 0 && (
                          <>
                            <SelectSeparator />
                            {convertibleUnits.map((u) => {
                              const compatible = canAutoConvertToUnit(
                                variants,
                                selectedVariant,
                                u
                              );
                              return (
                                <SelectItem key={u} value={u}>
                                  <span className="flex items-center gap-1.5">
                                    {u}
                                    {compatible && (
                                      <Check className="h-3 w-3 text-green-500" />
                                    )}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </>
                        )}
                        <SelectSeparator />
                        <SelectItem value="__custom__">
                          Custom unit...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {selectedVariant?.source === 'ai_estimate' &&
                      selectedVariant.ai_confidence && (
                        <Sparkles
                          className={`h-4 w-4 ${AI_PICKER_ICON_TONE_CLASSES[CONFIDENCE_TONES[selectedVariant.ai_confidence as AiConfidence]]}`}
                          aria-label={`AI estimate (${OVERALL_CONFIDENCE_LABELS[selectedVariant.ai_confidence as AiConfidence]} confidence)`}
                        />
                      )}
                  </div>
                </div>
              </div>

              {showMealTypeSelect &&
                availableMealTypes &&
                availableMealTypes.length > 0 && (
                  <div className="space-y-1">
                    <Label htmlFor="mealType">Meal</Label>
                    <Select value={mealType} onValueChange={setMealType}>
                      <SelectTrigger id="mealType" className="w-full text-sm">
                        <SelectValue placeholder="Select meal" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMealTypes.map((t) => (
                          <SelectItem key={t.id} value={t.name}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

              {showTimeInput && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="entryTime">Time (optional)</Label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleSetCurrentTime}
                        className="text-[10px] text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 font-medium flex items-center gap-0.5"
                        title="Set to current local time"
                      >
                        <Clock className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        Now
                      </button>
                      {resolvedDefaultMealTime && (
                        <>
                          <span className="text-gray-300 dark:text-gray-700 text-[10px]">
                            |
                          </span>
                          <button
                            type="button"
                            onClick={handleSetDefaultTime}
                            className="text-[10px] text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 font-medium flex items-center gap-0.5"
                            title={`Set to meal default (${resolvedDefaultMealTime.substring(0, 5)})`}
                          >
                            <CalendarDays className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            Default
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <Input
                    id="entryTime"
                    type="time"
                    value={entryTime}
                    onChange={(e) => setEntryTime(e.target.value)}
                  />
                </div>
              )}

              {/* Custom unit name input */}
              {pendingUnitIsCustom && (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/50">
                  <div>
                    <Label htmlFor="customUnitName">Unit name</Label>
                    <Input
                      id="customUnitName"
                      type="text"
                      placeholder="e.g. slice, bar, scoop"
                      value={pendingUnit}
                      onChange={(e) => {
                        setPendingUnit(e.target.value);
                        setConversionError('');
                      }}
                    />
                  </div>
                  {pendingUnit.trim() && (
                    <div>
                      <Label htmlFor="conversionFactor">
                        1 {pendingUnit.trim()} ={' '}
                        {conversionBaseVariant?.serving_unit}
                      </Label>
                      <Input
                        id="conversionFactor"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="e.g. 1"
                        value={conversionFactor}
                        onChange={(e) => {
                          const val = e.target.value;
                          setConversionFactor(val === '' ? '' : Number(val));
                          setConversionError('');
                        }}
                      />
                    </div>
                  )}
                  {conversionError && (
                    <p className="text-sm text-destructive">
                      {conversionError}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={cancelConversion}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* Manual factor needed for incompatible standard units */}
              {pendingUnit &&
                !pendingUnitIsCustom &&
                autoConversionFactor === null && (
                  <div className="border rounded-lg p-3 space-y-3 bg-muted/50">
                    <p className="text-sm text-muted-foreground">
                      These units can&apos;t be converted automatically — enter
                      how many{' '}
                      <strong>{conversionBaseVariant?.serving_unit}</strong> are
                      in 1 <strong>{pendingUnit}</strong>.
                    </p>

                    {/* AI estimate path: shown only when both units are
                        standard weight/volume AND AI is configured AND
                        preference is on AND no estimate has been auto-applied
                        yet. Auto-apply mode fires onAccept immediately, so
                        after success this whole block hides — the badge below
                        the label takes over as the AI indicator. */}
                    {aiEstimatesAvailable &&
                      conversionBaseVariant?.serving_unit &&
                      shouldOfferAiConversion(
                        conversionBaseVariant.serving_unit,
                        pendingUnit
                      ) &&
                      aiEstimateData === null && (
                        <AiEstimateSection
                          food={{
                            id: food.id,
                            name: food.name,
                            brand: food.brand,
                          }}
                          fromUnit={pendingUnit}
                          toUnit={conversionBaseVariant.serving_unit}
                          knownVariants={variants.map((v) => ({
                            amount: v.serving_size,
                            unit: v.serving_unit,
                          }))}
                          mode="auto-apply"
                          onAccept={setAiEstimateData}
                          onEdit={() => setAiEstimateData(null)}
                        />
                      )}

                    <div>
                      <Label
                        htmlFor="conversionFactor"
                        className="flex items-center gap-2"
                      >
                        <span>
                          1 {pendingUnit} = ?{' '}
                          {conversionBaseVariant?.serving_unit}
                        </span>
                        {aiEstimateData !== null && (
                          <span
                            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${AI_ESTIMATE_BADGE_TONE_CLASSES[CONFIDENCE_TONES[aiEstimateData.confidence]]}`}
                            aria-label={`AI estimate (${OVERALL_CONFIDENCE_LABELS[aiEstimateData.confidence]} confidence)`}
                          >
                            {
                              OVERALL_CONFIDENCE_LABELS[
                                aiEstimateData.confidence
                              ]
                            }{' '}
                            estimate
                          </span>
                        )}
                      </Label>
                      <Input
                        id="conversionFactor"
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="e.g. 1"
                        value={conversionFactor}
                        onChange={(e) => {
                          const val = e.target.value;
                          setConversionFactor(val === '' ? '' : Number(val));
                          setConversionError('');
                          // Editing the factor manually invalidates the AI
                          // provenance tag — the user is overriding the AI.
                          if (aiEstimateData !== null) {
                            setAiEstimateData(null);
                          }
                        }}
                      />
                    </div>
                    {conversionError && (
                      <p className="text-sm text-destructive">
                        {conversionError}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={cancelConversion}
                    >
                      Cancel
                    </Button>
                  </div>
                )}

              {nutrition && (
                <div className="bg-muted p-3 rounded-lg">
                  <h4 className="font-medium mb-2">
                    Nutrition for {quantity} {displayUnit}:
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      {Math.round(
                        convertEnergy(nutrition.calories, 'kcal', energyUnit)
                      )}{' '}
                      {getEnergyUnitString(energyUnit)}
                    </div>
                    <div>{nutrition.protein.toFixed(1)}g protein</div>
                    <div>{nutrition.carbs.toFixed(1)}g carbs</div>
                    <div>{nutrition.fat.toFixed(1)}g fat</div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createFoodVariantMutation.isPending ||
                    (!isConverting && !selectedVariant) ||
                    (isConverting &&
                      (!pendingUnit.trim() ||
                        (autoConversionFactor === null &&
                          (!conversionFactor || conversionFactor <= 0))))
                  }
                >
                  {createFoodVariantMutation.isPending
                    ? 'Saving...'
                    : initialQuantity
                      ? 'Update Food'
                      : 'Add to Meal'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FoodUnitSelector;
