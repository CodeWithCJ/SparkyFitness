import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Edit2,
  ExternalLink,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { ToolCallMessagePartComponent } from '@assistant-ui/react';
import {
  toPer100g,
  unbrandMacros,
  roundMacros,
  todayInZone,
  type FoodPhotoEstimateResponse,
  type FoodPhotoLogItem,
  type FoodPhotoLogRequest,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { useLogFoodPhotoEstimate } from '@/hooks/Foods/useFoodPhotoEstimate';
import { useFoodPhotoIngredientDraft } from '@/pages/Diary/useFoodPhotoIngredientDraft';
import { useDiaryInvalidation } from '@/hooks/useInvalidateKeys';
import MealBuilder from '@/components/MealBuilder';
import type { MealFood } from '@/types/meal';
import { cn } from '@/lib/utils';

export type SaveMode = 'ingredients_and_meal' | 'ingredients_only' | 'one_food';

function cleanMealName(summary?: string | null): string {
  if (!summary) return 'Photo Meal';
  let cleaned = summary.replace(/[.,;:]+$/, '').trim();
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned || 'Photo Meal';
}

function getDefaultMealType(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 22) return 'dinner';
  return 'snack';
}

function getTodayString(): string {
  try {
    return todayInZone(
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    );
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

interface EstimateToolResult {
  text?: string;
  estimate?: FoodPhotoEstimateResponse;
  meal_type?: string;
}

export const FoodPhotoEstimateToolUI: ToolCallMessagePartComponent<
  { image_url?: string; meal_type?: string },
  EstimateToolResult | string
> = ({ args, result, status }) => {
  const { t } = useTranslation();
  const invalidateDiary = useDiaryInvalidation();
  const [logged, setLogged] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showMealBuilderModal, setShowMealBuilderModal] = useState(false);
  const [saveMode, setSaveMode] = useState<SaveMode>('ingredients_and_meal');

  const detectedMealType = useMemo(() => {
    if (args?.meal_type) return args.meal_type;
    if (
      typeof result === 'object' &&
      result &&
      'meal_type' in result &&
      typeof result.meal_type === 'string'
    ) {
      return result.meal_type;
    }
    return null;
  }, [args, result]);

  const [selectedMealType, setSelectedMealType] = useState<string | null>(null);
  const mealType = selectedMealType || detectedMealType || getDefaultMealType();

  const [entryDate] = useState<string>(getTodayString);

  // Parse structured estimate from tool call result
  const estimate = useMemo<FoodPhotoEstimateResponse | null>(() => {
    if (!result) return null;
    if (typeof result === 'object' && 'estimate' in result && result.estimate) {
      return result.estimate;
    }
    if (
      typeof result === 'object' &&
      'items' in result &&
      Array.isArray((result as { items?: unknown[] }).items)
    ) {
      return result as unknown as FoodPhotoEstimateResponse;
    }
    if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        if (parsed?.estimate) return parsed.estimate;
        if (parsed?.items) return parsed;
      } catch {
        // Not a JSON string
      }
    }
    return null;
  }, [result]);

  const [customMealName, setCustomMealName] = useState<string | null>(null);

  const mealName = customMealName ?? cleanMealName(estimate?.meal_summary);

  const initialItems = useMemo(() => estimate?.items ?? [], [estimate]);

  const { rows, totals, totalGrams, dispatch } =
    useFoodPhotoIngredientDraft(initialItems);

  const { mutateAsync: logEstimate, isPending: isLogging } =
    useLogFoodPhotoEstimate({
      onSuccess: () => {
        setLogged(true);
        toast({
          title: t('foodPhoto.logged', { defaultValue: 'Estimate logged!' }),
          description: t('foodPhoto.loggedSuccess', {
            defaultValue: 'Meal successfully logged to your diary.',
          }),
        });
      },
      onError: (err) => {
        toast({
          title: t('foodPhoto.logFailedTitle', {
            defaultValue: 'Could not log the estimate',
          }),
          description: err.message,
          variant: 'destructive',
        });
      },
    });

  const handleLog = useCallback(async () => {
    if (!estimate || logged || isLogging) return;

    let items: FoodPhotoLogItem[] = [];

    if (saveMode === 'one_food') {
      const grams = totalGrams > 0 ? totalGrams : estimate.totals.total_grams;
      const per100g = toPer100g(totals, grams);
      if (!per100g) {
        toast({
          title: t('foodPhoto.logFailedTitle', {
            defaultValue: 'Could not log the estimate',
          }),
          description: t('foodPhoto.noIngredients', {
            defaultValue:
              'Keep at least one ingredient with a weight above zero.',
          }),
          variant: 'destructive',
        });
        return;
      }
      const rounded = unbrandMacros(roundMacros(per100g));
      items = [
        {
          source: 'new',
          food: {
            name: mealName.trim() || 'Photo estimate',
            brand: null,
            serving_size: 100,
            serving_unit: 'g',
            calories: rounded.calories_kcal,
            protein: rounded.protein_g,
            carbs: rounded.carbs_g,
            fat: rounded.fat_g,
            dietary_fiber: rounded.fiber_g,
            sugars: rounded.sugar_g,
            ai_confidence: estimate.overall_confidence,
          },
          quantity: grams,
          unit: 'g',
        },
      ];
    } else {
      for (const row of rows) {
        if (!Number.isFinite(row.grams) || row.grams <= 0) continue;
        if (row.matchApplied && row.match?.food_id && row.match.variant_id) {
          items.push({
            source: 'existing',
            food_id: row.match.food_id,
            variant_id: row.match.variant_id,
            quantity: row.grams,
            unit: 'g',
          });
        } else {
          const per100g = toPer100g(row.macros, row.grams);
          if (!per100g) continue;
          const rounded = unbrandMacros(roundMacros(per100g));
          items.push({
            source: 'new',
            food: {
              name: row.name.trim() || 'Ingredient',
              brand: null,
              serving_size: 100,
              serving_unit: 'g',
              calories: rounded.calories_kcal,
              protein: rounded.protein_g,
              carbs: rounded.carbs_g,
              fat: rounded.fat_g,
              dietary_fiber: rounded.fiber_g,
              sugars: rounded.sugar_g,
              ai_confidence: row.confidence,
            },
            quantity: row.grams,
            unit: 'g',
          });
        }
      }
    }

    if (items.length === 0) {
      toast({
        title: t('foodPhoto.logFailedTitle', {
          defaultValue: 'Could not log the estimate',
        }),
        description: t('foodPhoto.noIngredients', {
          defaultValue:
            'Keep at least one ingredient with a weight above zero.',
        }),
        variant: 'destructive',
      });
      return;
    }

    const payload: FoodPhotoLogRequest = {
      mode: saveMode === 'one_food' ? 'combined' : 'grouped',
      entry_date: entryDate,
      entry_time: null,
      meal_type: mealType,
      meal_type_id: null,
      name: mealName.trim() || 'Photo estimate',
      description: estimate.confidence_reason || null,
      items,
      ...(saveMode === 'ingredients_and_meal'
        ? { save_as_meal: { name: mealName.trim() || 'Photo estimate' } }
        : {}),
    };

    await logEstimate(payload);
  }, [
    estimate,
    logged,
    isLogging,
    saveMode,
    totalGrams,
    totals,
    mealName,
    rows,
    entryDate,
    mealType,
    logEstimate,
    t,
  ]);

  // Convert current draft rows to MealFood[] for MealBuilder modal
  const mealBuilderFoods = useMemo<MealFood[]>(() => {
    return rows.map((row) => {
      const per100g = toPer100g(row.macros, row.grams);
      const rounded = per100g
        ? unbrandMacros(roundMacros(per100g))
        : unbrandMacros(roundMacros(row.macros));
      return {
        id: row.id,
        food_id: row.match?.food_id || undefined,
        variant_id: row.match?.variant_id || undefined,
        food_name: row.name,
        quantity: row.grams,
        unit: 'g',
        calories: rounded.calories_kcal,
        protein: rounded.protein_g,
        carbs: rounded.carbs_g,
        fat: rounded.fat_g,
        dietary_fiber: rounded.fiber_g,
        sugars: rounded.sugar_g,
        serving_size: 100,
        serving_unit: 'g',
      };
    });
  }, [rows]);

  if (status?.type === 'running' || (!result && !estimate)) {
    return (
      <div className="my-3 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm animate-pulse">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            {t('foodPhoto.analyzing', {
              defaultValue: 'Analyzing meal photo...',
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('foodPhoto.analyzingHint', {
              defaultValue: 'Detecting ingredients, gram portions, and macros',
            })}
          </p>
        </div>
      </div>
    );
  }

  if (!estimate) {
    return null;
  }

  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-md transition-all">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Camera className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                {t('foodPhoto.title', { defaultValue: 'Meal Photo Estimate' })}
              </span>
              <Badge
                variant={
                  estimate.overall_confidence === 'high'
                    ? 'default'
                    : estimate.overall_confidence === 'medium'
                      ? 'secondary'
                      : 'outline'
                }
                className="text-[10px] px-1.5 py-0 uppercase"
              >
                {estimate.overall_confidence}
              </Badge>
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="h-8 w-8 p-0"
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Meal Title Input & Slot Picker */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t('foodPhoto.mode.mealName', { defaultValue: 'Meal Name' })}
              </Label>
              <Input
                type="text"
                value={mealName}
                onChange={(e) => setCustomMealName(e.target.value)}
                disabled={logged}
                placeholder="e.g. Chicken Penne Pasta"
                className="h-9 font-medium"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {t('common.mealSlot', { defaultValue: 'Meal Slot' })}
              </Label>
              <Select
                value={mealType}
                onValueChange={setSelectedMealType}
                disabled={logged}
              >
                <SelectTrigger className="h-9 capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Live Macro Summary Bar */}
          <div className="grid grid-cols-4 gap-2 rounded-xl bg-muted/60 p-2.5 text-center">
            <div>
              <div className="text-xs text-muted-foreground">
                {t('foodPhoto.columns.calories', { defaultValue: 'Calories' })}
              </div>
              <div className="text-sm font-bold text-foreground">
                {Math.round(totals.calories_kcal)} kcal
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {t('foodPhoto.columns.protein', { defaultValue: 'Protein' })}
              </div>
              <div className="text-sm font-bold text-primary">
                {Math.round(totals.protein_g * 10) / 10}g
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {t('foodPhoto.columns.carbs', { defaultValue: 'Carbs' })}
              </div>
              <div className="text-sm font-bold text-amber-500">
                {Math.round(totals.carbs_g * 10) / 10}g
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {t('foodPhoto.columns.fat', { defaultValue: 'Fat' })}
              </div>
              <div className="text-sm font-bold text-rose-500">
                {Math.round(totals.fat_g * 10) / 10}g
              </div>
            </div>
          </div>

          {/* Ingredient List / Rows */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('foodPhoto.columns.ingredient', {
                  defaultValue: 'Ingredients Breakdown',
                })}{' '}
                ({rows.length})
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowMealBuilderModal(true)}
                disabled={logged}
                className="h-7 px-2 text-xs text-primary hover:bg-primary/10 gap-1"
              >
                <Edit2 className="h-3 w-3" />
                {t('foodPhoto.editInMealBuilder', {
                  defaultValue: 'Edit in Meal Builder',
                })}
              </Button>
            </div>

            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden bg-background">
              {rows.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  {t('foodPhoto.emptyIngredients', {
                    defaultValue: 'No ingredients listed.',
                  })}
                </div>
              ) : (
                rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 gap-2 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm text-foreground truncate">
                          {row.name}
                        </span>
                        {row.matchApplied && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1 py-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0"
                          >
                            ✓ Matched
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {Math.round(row.macros.calories_kcal)} kcal · P:{' '}
                        {Math.round(row.macros.protein_g * 10) / 10}g · C:{' '}
                        {Math.round(row.macros.carbs_g * 10) / 10}g · F:{' '}
                        {Math.round(row.macros.fat_g * 10) / 10}g
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          max={9999}
                          value={row.grams || ''}
                          onChange={(e) =>
                            dispatch({
                              type: 'SET_GRAMS',
                              id: row.id,
                              grams: Number(e.target.value) || 0,
                            })
                          }
                          disabled={logged}
                          className="h-8 w-20 text-right px-2 py-0 font-medium text-xs"
                        />
                        <span className="text-xs text-muted-foreground">g</span>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          dispatch({ type: 'REMOVE_ROW', id: row.id })
                        }
                        disabled={logged}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Save Mode Selector */}
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs font-semibold text-foreground">
              {t('foodPhoto.mode.label', { defaultValue: 'How to save' })}
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSaveMode('ingredients_and_meal')}
                disabled={logged}
                className={cn(
                  'flex flex-col text-left p-2.5 rounded-xl border transition-all text-xs',
                  saveMode === 'ingredients_and_meal'
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                    : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                )}
              >
                <span className="font-semibold text-foreground flex items-center gap-1">
                  🍱{' '}
                  {t('foodPhoto.mode.ingredientsAndMeal', {
                    defaultValue: 'Ingredients + Meal',
                  })}
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                  Grouped in diary + saved to Meals tab
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSaveMode('ingredients_only')}
                disabled={logged}
                className={cn(
                  'flex flex-col text-left p-2.5 rounded-xl border transition-all text-xs',
                  saveMode === 'ingredients_only'
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                    : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                )}
              >
                <span className="font-semibold text-foreground flex items-center gap-1">
                  🥗{' '}
                  {t('foodPhoto.mode.ingredientsOnly', {
                    defaultValue: 'Ingredients only',
                  })}
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                  Individual items without reusable template
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSaveMode('one_food')}
                disabled={logged}
                className={cn(
                  'flex flex-col text-left p-2.5 rounded-xl border transition-all text-xs',
                  saveMode === 'one_food'
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                    : 'border-border bg-background hover:bg-muted/50 text-muted-foreground'
                )}
              >
                <span className="font-semibold text-foreground flex items-center gap-1">
                  🍲{' '}
                  {t('foodPhoto.mode.oneFood', {
                    defaultValue: 'One food',
                  })}
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                  Single merged food item for whole dish
                </span>
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowMealBuilderModal(true)}
              disabled={logged}
              className="sm:w-1/2 text-xs gap-1.5 h-9"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('foodPhoto.openInMealBuilder', {
                defaultValue: 'Open in Meal Builder',
              })}
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleLog}
              disabled={
                logged ||
                isLogging ||
                (saveMode !== 'one_food' && rows.length === 0)
              }
              className={cn(
                'sm:w-1/2 text-xs font-semibold gap-1.5 h-9 transition-all',
                logged
                  ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
                  : 'bg-primary text-primary-foreground'
              )}
            >
              {isLogging ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('common.saving', { defaultValue: 'Logging...' })}
                </>
              ) : logged ? (
                <>
                  <Check className="h-4 w-4" />
                  {t('foodPhoto.logged', { defaultValue: 'Logged to Diary!' })}
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('foodPhoto.log', { defaultValue: 'Log to Diary' })}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Full MealBuilder Dialog - Reuses the exact same component as Foods tab */}
      <Dialog
        open={showMealBuilderModal}
        onOpenChange={setShowMealBuilderModal}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {t('mealManagement.createMeal', { defaultValue: 'Create Meal' })}
            </DialogTitle>
          </DialogHeader>
          <MealBuilder
            initialFoods={mealBuilderFoods}
            initialMealName={mealName}
            source="food-diary"
            foodEntryDate={entryDate}
            foodEntryMealType={mealType}
            onCancel={() => setShowMealBuilderModal(false)}
            onSave={() => {
              invalidateDiary();
              setShowMealBuilderModal(false);
              setLogged(true);
              toast({
                title: t('foodPhoto.logged', {
                  defaultValue: 'Estimate logged!',
                }),
                description: t('foodPhoto.loggedSuccess', {
                  defaultValue: 'Meal successfully logged to your diary.',
                }),
              });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
