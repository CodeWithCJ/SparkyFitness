import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2, Upload, X } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  toPer100g,
  unbrandMacros,
  roundMacros,
  type FoodPhotoEstimateResponse,
  type FoodPhotoEstimateItem,
  type FoodPhotoLogItem,
} from '@workspace/shared';
import {
  useEstimateFoodPhoto,
  useLogFoodPhotoEstimate,
} from '@/hooks/Foods/useFoodPhotoEstimate';
import {
  describeEstimateError,
  FoodPhotoEstimateError,
  MAX_PHOTO_IMAGES,
  MAX_DESCRIPTION_LENGTH,
  MAX_TOTAL_BASE64_LENGTH,
} from '@/utils/foodPhotoEstimate';
import { resizeImageBase64, splitDataUrl } from '@/utils/imageResize';
import FoodPhotoIngredientTable from './FoodPhotoIngredientTable';
import { useFoodPhotoIngredientDraft } from './useFoodPhotoIngredientDraft';

type Step = 'capture' | 'review';
/**
 * How the plate is saved. The two ingredient options render an identical diary
 * row; they differ only in whether a reusable meal template is created, which
 * is what lets the plate be re-logged later without another photo.
 */
type SaveMode = 'ingredients_and_meal' | 'ingredients_only' | 'one_food';

/**
 * Stable empty list for the pre-estimate render. An inline `[]` would be a new
 * reference every render, which the draft hook would read as a new estimate.
 */
const NO_ITEMS: FoodPhotoEstimateItem[] = [];

export interface FoodPhotoEstimateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Calendar day string (YYYY-MM-DD) the entry belongs to. */
  entryDate: string;
  /** Meal type name, e.g. "lunch". */
  mealType: string;
  mealTypeId?: string | null;
  onLogged?: () => void;
}

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });

/**
 * The web AI food-photo flow: capture → estimate → edit ingredients → log.
 *
 * A dialog rather than a route, matching every other Diary flow
 * (`LogMealDialog`, `ConvertToMealDialog`), so the selected day and meal type
 * stay in scope instead of being re-derived from the URL.
 */
const FoodPhotoEstimateDialog = ({
  open,
  onOpenChange,
  entryDate,
  mealType,
  mealTypeId,
  onLogged,
}: FoodPhotoEstimateDialogProps) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('capture');
  const [images, setImages] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [totalWeight, setTotalWeight] = useState('');
  const [estimate, setEstimate] = useState<FoodPhotoEstimateResponse | null>(
    null
  );
  const [saveMode, setSaveMode] = useState<SaveMode>('ingredients_and_meal');
  const [mealName, setMealName] = useState('');
  const mode: 'grouped' | 'combined' =
    saveMode === 'one_food' ? 'combined' : 'grouped';

  const draft = useFoodPhotoIngredientDraft(estimate?.items ?? NO_ITEMS);

  const reset = useCallback(() => {
    setStep('capture');
    setImages([]);
    setDescription('');
    setTotalWeight('');
    setEstimate(null);
    setSaveMode('ingredients_and_meal');
    setMealName('');
  }, []);

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const room = MAX_PHOTO_IMAGES - images.length;
    if (room <= 0) {
      toast({
        title: t('foodPhoto.tooManyPhotosTitle', {
          defaultValue: 'Too many photos',
        }),
        description: t('foodPhoto.tooManyPhotosMessage', {
          defaultValue: 'Up to {{count}} photos can be analysed together.',
          count: MAX_PHOTO_IMAGES,
        }),
        variant: 'destructive',
      });
      return;
    }

    const picked = Array.from(fileList).slice(0, room);
    const resized: string[] = [];
    for (const file of picked) {
      const dataUrl = await readFileAsDataUrl(file);
      resized.push(await resizeImageBase64(dataUrl));
    }

    const next = [...images, ...resized];
    // Mirrors the server's combined-size cap so an oversized batch fails here
    // instead of after a slow upload.
    const totalLength = next.reduce((sum, item) => sum + item.length, 0);
    if (totalLength > MAX_TOTAL_BASE64_LENGTH) {
      toast({
        title: t('foodPhoto.photosTooLargeTitle', {
          defaultValue: 'Photos too large',
        }),
        description: t('foodPhoto.photosTooLargeMessage', {
          defaultValue: 'Remove a photo, or use smaller images.',
        }),
        variant: 'destructive',
      });
      return;
    }
    setImages(next);
  };

  const estimateMutation = useEstimateFoodPhoto({
    onSuccess: (result) => {
      setEstimate(result);
      setMealName(result.meal_summary || 'Photo estimate');
      setStep('review');
    },
    onError: (error) => {
      const code =
        error instanceof FoodPhotoEstimateError ? error.code : 'UPSTREAM_ERROR';
      const copy = describeEstimateError(code);
      toast({
        title: t(copy.titleKey, {
          defaultValue: 'Could not analyse the photo',
        }),
        description: t(copy.messageKey, {
          defaultValue: copy.isConfiguration
            ? 'Configure an AI provider in Settings to use photo estimates.'
            : 'Try again, or log this food manually.',
        }),
        variant: 'destructive',
      });
    },
  });

  /**
   * Build the log payload from the edited rows.
   *
   * Row nutrition is per-portion (it describes `grams`); a created food stores
   * per-100 g. `toPer100g` is the only bridge, and its branded return type
   * makes sending per-portion numbers as per-100 g a compile error.
   */
  const buildItems = (): FoodPhotoLogItem[] => {
    const items: FoodPhotoLogItem[] = [];
    for (const row of draft.rows) {
      if (row.grams <= 0) continue;

      // Only a match against a food that already exists locally can be logged
      // by id. A provider match has no food_id — the food is created below
      // from the provider's nutrition, which `row.macros` already holds.
      if (row.matchApplied && row.match?.food_id && row.match.variant_id) {
        items.push({
          source: 'existing',
          food_id: row.match.food_id,
          variant_id: row.match.variant_id,
          quantity: row.grams,
          unit: 'g',
        });
        continue;
      }

      const per100g = toPer100g(row.macros, row.grams);
      if (!per100g) continue;
      const rounded = unbrandMacros(roundMacros(per100g));
      items.push({
        source: 'new',
        food: {
          name: row.name.trim() || row.canonicalName,
          brand: row.matchApplied ? (row.match?.brand ?? null) : null,
          serving_size: 100,
          serving_unit: 'g',
          calories: rounded.calories_kcal,
          protein: rounded.protein_g,
          carbs: rounded.carbs_g,
          fat: rounded.fat_g,
          dietary_fiber: rounded.fiber_g,
          sugars: rounded.sugar_g,
          // Marks the stored food as an AI estimate so it is not mistaken for
          // verified data later. A row showing a matched provider food is not
          // a guess, so it carries no confidence.
          ...(row.matchApplied ? {} : { ai_confidence: row.confidence }),
        },
        quantity: row.grams,
        unit: 'g',
      });
    }
    return items;
  };

  const buildCombinedItem = (): FoodPhotoLogItem[] => {
    // `draft.totals` is already PortionMacros — no cast; the brand is the point.
    const per100g = toPer100g(draft.totals, draft.totalGrams);
    if (!per100g) return [];
    const rounded = unbrandMacros(roundMacros(per100g));
    return [
      {
        source: 'new',
        food: {
          name: estimate?.meal_summary || 'Photo estimate',
          brand: null,
          serving_size: 100,
          serving_unit: 'g',
          calories: rounded.calories_kcal,
          protein: rounded.protein_g,
          carbs: rounded.carbs_g,
          fat: rounded.fat_g,
          dietary_fiber: rounded.fiber_g,
          sugars: rounded.sugar_g,
        },
        quantity: draft.totalGrams,
        unit: 'g',
      },
    ];
  };

  const logMutation = useLogFoodPhotoEstimate({
    onSuccess: () => {
      toast({
        title: t('foodPhoto.logged', { defaultValue: 'Estimate logged' }),
      });
      onLogged?.();
      handleClose(false);
    },
    onError: () => {
      toast({
        title: t('foodPhoto.logFailedTitle', {
          defaultValue: 'Could not log the estimate',
        }),
        description: t('foodPhoto.logFailedMessage', {
          defaultValue: 'Please try again.',
        }),
        variant: 'destructive',
      });
    },
  });

  /** Encode the staged photos and kick off the estimate. */
  const handleAnalyse = () => {
    const payloadImages = images
      .map((dataUrl) => splitDataUrl(dataUrl))
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .map((item) => ({ image: item.base64, mime_type: item.mimeType }));

    const weight = totalWeight.trim() === '' ? undefined : Number(totalWeight);
    estimateMutation.mutate({
      images: payloadImages,
      description: description.trim() || undefined,
      // The server requires weight and unit together or not at all.
      ...(weight !== undefined && Number.isFinite(weight) && weight > 0
        ? { totalWeight: weight, weightUnit: 'g' as const }
        : {}),
    });
  };

  const handleLog = () => {
    const items = mode === 'grouped' ? buildItems() : buildCombinedItem();
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
    logMutation.mutate({
      mode,
      entry_date: entryDate,
      entry_time: null,
      meal_type: mealType,
      meal_type_id: mealTypeId ?? null,
      name: mealName.trim() || estimate?.meal_summary || 'Photo estimate',
      description: estimate?.confidence_reason || null,
      items,
      ...(saveMode === 'ingredients_and_meal'
        ? { save_as_meal: { name: mealName.trim() || 'Photo estimate' } }
        : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('foodPhoto.title', { defaultValue: 'Estimate from a photo' })}
          </DialogTitle>
          <DialogDescription>
            {step === 'capture'
              ? t('foodPhoto.captureDescription', {
                  defaultValue:
                    'Add one or more photos of the meal. A second angle helps with stacked or mixed dishes.',
                })
              : t('foodPhoto.reviewDescription', {
                  defaultValue:
                    'Check each ingredient before logging. Editing the grams recalculates that row.',
                })}
          </DialogDescription>
        </DialogHeader>

        {step === 'capture' ? (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= MAX_PHOTO_IMAGES}
            >
              <Upload className="h-4 w-4 mr-2" />
              {t('foodPhoto.addPhotos', { defaultValue: 'Add photos' })}
            </Button>

            {images.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {images.map((image, index) => (
                  <div key={image.slice(-32)} className="relative">
                    <img
                      src={image}
                      alt={t('foodPhoto.photoAlt', {
                        defaultValue: 'Meal photo {{number}}',
                        number: index + 1,
                      })}
                      className="h-24 w-24 object-cover rounded-md border"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={() =>
                        setImages(images.filter((_, i) => i !== index))
                      }
                      aria-label={t('foodPhoto.removePhoto', {
                        defaultValue: 'Remove photo {{number}}',
                        number: index + 1,
                      })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="photo-description">
                {t('foodPhoto.descriptionLabel', {
                  defaultValue: 'Description (optional)',
                })}
              </Label>
              <Textarea
                id="photo-description"
                value={description}
                maxLength={MAX_DESCRIPTION_LENGTH}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('foodPhoto.descriptionPlaceholder', {
                  defaultValue:
                    'e.g. chicken thigh, no skin, cooked in olive oil',
                })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="photo-weight">
                {t('foodPhoto.weightLabel', {
                  defaultValue: 'Total weight in grams (optional)',
                })}
              </Label>
              <Input
                id="photo-weight"
                type="number"
                min={0}
                value={totalWeight}
                onChange={(event) => setTotalWeight(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('foodPhoto.weightHint', {
                  defaultValue:
                    'Portion size is where photo estimates are least accurate. Weighing the plate makes the numbers far more reliable.',
                })}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="photo-save-mode">
                {t('foodPhoto.mode.label', { defaultValue: 'Save as' })}
              </Label>
              <Select
                value={saveMode}
                onValueChange={(value) => setSaveMode(value as SaveMode)}
              >
                <SelectTrigger id="photo-save-mode" className="w-full sm:w-96">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ingredients_and_meal">
                    {t('foodPhoto.mode.ingredientsAndMeal', {
                      defaultValue: 'Ingredients + reusable meal',
                    })}
                  </SelectItem>
                  <SelectItem value="ingredients_only">
                    {t('foodPhoto.mode.ingredientsOnly', {
                      defaultValue: 'Ingredients only',
                    })}
                  </SelectItem>
                  <SelectItem value="one_food">
                    {t('foodPhoto.mode.oneFood', { defaultValue: 'One food' })}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {saveMode === 'ingredients_and_meal'
                  ? t('foodPhoto.mode.hintIngredientsAndMeal', {
                      defaultValue:
                        'Each ingredient becomes its own food, and the meal is saved so you can log it again without a photo.',
                    })
                  : saveMode === 'ingredients_only'
                    ? t('foodPhoto.mode.hintIngredientsOnly', {
                        defaultValue:
                          'Each ingredient becomes its own food. Nothing is added to your meals.',
                      })
                    : t('foodPhoto.mode.hintOneFood', {
                        defaultValue:
                          'Saves the whole plate as a single food, with no breakdown.',
                      })}
              </p>
              {saveMode === 'ingredients_and_meal' ? (
                <div className="space-y-1 pt-1">
                  <Label htmlFor="photo-meal-name">
                    {t('foodPhoto.mode.mealName', {
                      defaultValue: 'Meal name',
                    })}
                  </Label>
                  <Input
                    id="photo-meal-name"
                    value={mealName}
                    onChange={(event) => setMealName(event.target.value)}
                    className="w-full sm:w-96"
                  />
                </div>
              ) : null}
            </div>

            {estimate?.confidence_reason ? (
              <p className="text-xs text-muted-foreground">
                {estimate.confidence_reason}
              </p>
            ) : null}

            {draft.matchedCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('foodPhoto.match.summary', {
                  defaultValue:
                    '{{count}} ingredients matched to foods already in your library.',
                  count: draft.matchedCount,
                })}
              </p>
            ) : null}

            <FoodPhotoIngredientTable
              rows={draft.rows}
              totals={draft.totals}
              totalGrams={draft.totalGrams}
              onChangeGrams={(id, grams) =>
                draft.dispatch({ type: 'SET_GRAMS', id, grams })
              }
              onChangeName={(id, name) =>
                draft.dispatch({ type: 'SET_NAME', id, name })
              }
              onChangeMacro={(id, key, value) =>
                draft.dispatch({ type: 'SET_MACRO', id, key, value })
              }
              onRemove={(id) => draft.dispatch({ type: 'REMOVE_ROW', id })}
              onApplyMatch={(id) => draft.dispatch({ type: 'APPLY_MATCH', id })}
              onClearMatch={(id) => draft.dispatch({ type: 'CLEAR_MATCH', id })}
              onRecalcFromGrams={(id) =>
                draft.dispatch({ type: 'RECALC_FROM_GRAMS', id })
              }
            />
          </div>
        )}

        <DialogFooter>
          {step === 'capture' ? (
            <Button
              type="button"
              onClick={handleAnalyse}
              disabled={images.length === 0 || estimateMutation.isPending}
            >
              {estimateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Camera className="h-4 w-4 mr-2" />
              )}
              {t('foodPhoto.analyse', { defaultValue: 'Analyse photo' })}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('capture')}
              >
                {t('common.back', { defaultValue: 'Back' })}
              </Button>
              <Button
                type="button"
                onClick={handleLog}
                disabled={logMutation.isPending}
              >
                {logMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {t('foodPhoto.log', { defaultValue: 'Log to diary' })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FoodPhotoEstimateDialog;
