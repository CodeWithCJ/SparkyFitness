import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Share2, Sparkles, Star } from 'lucide-react';
import { NutrientGrid } from './NutrientGrid';
import ProviderVerifiedBadge from './ProviderVerifiedBadge';
import AllergenBadges from '@/components/AllergenBadges';
import type { Food } from '@/types/food';
import type { Meal } from '@/types/meal';
import type { UserCustomNutrient } from '@/types/customNutrient';
import { useTranslation } from 'react-i18next';
import { EnergyUnit } from '@/contexts/PreferencesContext';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { formatServingLabel } from '@/utils/foodServing';
import { resolveFoodImageSrc, usableFoodImages } from '@/utils/foodImages';
import ImageLightbox from './ImageLightbox';
import {
  CONFIDENCE_TONES,
  OVERALL_CONFIDENCE_LABELS,
  type AiConfidence,
  type ConfidenceTone,
} from '@workspace/shared';

const AI_BADGE_TONE_CLASSES: Record<ConfidenceTone, string> = {
  success:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  error: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};

interface NutrientGridConfig {
  visibleNutrients: string[];
  energyUnit: EnergyUnit;
  convertEnergy: (val: number, from: EnergyUnit, to: EnergyUnit) => number;
  getEnergyUnitString: (unit: EnergyUnit) => string;
  customNutrients: UserCustomNutrient[];
}

interface FoodResultCardProps {
  item: Food | Meal;
  isMeal?: boolean;
  isOnline?: boolean;
  providerLabel?: string;
  // When set, the provider badge is tinted with this colour (used by the All
  // Providers "Top Matches" section to tell sources apart at a glance).
  providerBadgeColor?: string;
  /**
   * Explicit image override. Provider search results pass the upstream URL
   * here; local foods and meals fall back to their own stored `images`.
   */
  imageUrl?: string;
  nutrientConfig: NutrientGridConfig;
  onCardClick?: () => void;
  onEditClick?: () => void;
  // Whether this row is starred. Passed down rather than queried per-card: the
  // parent already holds the favorites Set, so one card mounting N rows is one
  // lookup, not N copies of useFavoritesQuery.
  isFavorite?: boolean;
}

const FoodResultCard = ({
  item,
  isMeal = false,
  isOnline = false,
  providerLabel,
  providerBadgeColor,
  imageUrl,
  nutrientConfig,
  onCardClick,
  onEditClick,
  isFavorite = false,
}: FoodResultCardProps) => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const isFood = !isMeal;
  const foodItem = item as Food;
  // Provider results carry a single upstream `image_url`; imported foods and
  // meals carry an `images` array. resolveFoodImageSrc handles both absolute
  // provider URLs and server-relative upload paths.
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Set when the thumbnail 404s and we swap to the full-size variant, so the
  // viewer opens the image that actually loaded rather than the failed one.
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  // Providers that serve a small and a full-size variant give us both; if the
  // small one is missing upstream, swap to the full size before giving up.
  const fallbackImageSrc = resolveFoodImageSrc(foodItem.image_source_url);
  // All images for the viewer; provider results only ever have the one.
  const galleryImages = (() => {
    const own = usableFoodImages(item.images);
    if (own.length > 0) {
      return own;
    }
    if (thumbnailFailed && fallbackImageSrc) {
      return [fallbackImageSrc];
    }
    const single =
      resolveFoodImageSrc(imageUrl) ?? resolveFoodImageSrc(foodItem.image_url);
    return single ? [single] : [];
  })();
  const resolvedImageSrc = galleryImages[0] ?? null;
  const mealItem = item as Meal;
  // Hex opacity suffixes are only valid on a full #rrggbb value; other colour
  // formats (CSS vars, named colours, #rgb) are used as-is without a tint.
  const badgeIsHex =
    !!providerBadgeColor &&
    providerBadgeColor.startsWith('#') &&
    providerBadgeColor.length === 7;

  return (
    <Card
      className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${onCardClick ? 'cursor-pointer' : ''}`}
      onClick={onCardClick}
    >
      <CardContent className="p-4">
        <div className="flex justify-between items-start gap-3">
          {/* Thumbnail rail, mirroring the diary rows: image on the left with
              the name and nutrients stacked beside it, so a row with a photo
              is no taller than one without. */}
          {resolvedImageSrc && (
            <button
              type="button"
              className="shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={(e) => {
                // The card itself is clickable; don't also select the food.
                e.stopPropagation();
                setLightboxOpen(true);
              }}
              aria-label={t('food.viewImages', 'View images')}
            >
              <img
                src={resolvedImageSrc}
                alt={item.name}
                className="w-14 h-14 object-cover rounded-md cursor-zoom-in"
                loading="lazy"
                onError={(e) => {
                  const img = e.currentTarget;
                  // One-shot flag rather than comparing src: the browser
                  // resolves `img.src` to an absolute URL, so a relative
                  // fallback would never compare equal and would retry forever.
                  if (fallbackImageSrc && !img.dataset['triedFallback']) {
                    img.dataset['triedFallback'] = 'true';
                    img.src = fallbackImageSrc;
                    // Point the viewer at the same replacement.
                    setThumbnailFailed(true);
                    return;
                  }
                  // A dead provider link shouldn't leave a broken-image icon.
                  img.style.display = 'none';
                }}
              />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-2">
              <h3 className="font-medium">{item.name}</h3>
              {isFood && foodItem.brand && (
                <Badge variant="secondary" className="text-xs">
                  {foodItem.brand}
                </Badge>
              )}
              {isMeal && (
                <Badge variant="outline" className="text-xs">
                  {t('enhancedFoodSearch.meal', 'Meal')}
                </Badge>
              )}
              {providerLabel && (
                <Badge
                  variant="outline"
                  className="text-xs"
                  style={
                    providerBadgeColor
                      ? {
                          color: providerBadgeColor,
                          borderColor: badgeIsHex
                            ? `${providerBadgeColor}55`
                            : providerBadgeColor,
                          backgroundColor: badgeIsHex
                            ? `${providerBadgeColor}1f`
                            : undefined,
                        }
                      : undefined
                  }
                >
                  {providerLabel}
                </Badge>
              )}
              {isFood && foodItem.provider_verified && (
                <ProviderVerifiedBadge />
              )}
              {isFood &&
                foodItem.default_variant?.source === 'ai_estimate' &&
                foodItem.default_variant.ai_confidence && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${AI_BADGE_TONE_CLASSES[CONFIDENCE_TONES[foodItem.default_variant.ai_confidence as AiConfidence]]}`}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI{' '}
                    {
                      OVERALL_CONFIDENCE_LABELS[
                        foodItem.default_variant.ai_confidence as AiConfidence
                      ]
                    }{' '}
                    estimate
                  </Badge>
                )}
              {!isOnline &&
                item.user_id &&
                item.user_id === activeUserId &&
                !(isFood
                  ? foodItem.shared_with_public
                  : mealItem.is_public) && (
                  <Badge variant="outline" className="text-xs">
                    {t('enhancedFoodSearch.private', 'Private')}
                  </Badge>
                )}
              {!isOnline &&
                (isFood ? foodItem.shared_with_public : mealItem.is_public) && (
                  <Badge variant="outline" className="text-xs">
                    <Share2 className="h-3 w-3 mr-1" />
                    {t('enhancedFoodSearch.public', 'Public')}
                  </Badge>
                )}
              {!isOnline &&
                item.user_id &&
                item.user_id !== activeUserId &&
                !(isFood
                  ? foodItem.shared_with_public
                  : mealItem.is_public) && (
                  <Badge variant="outline" className="text-xs">
                    {t('enhancedFoodSearch.family', 'Family')}
                  </Badge>
                )}
              {isFood &&
                foodItem.default_variant?.glycemic_index &&
                foodItem.default_variant.glycemic_index !== 'None' && (
                  <Badge variant="outline" className="text-xs">
                    GI: {foodItem.default_variant.glycemic_index}
                  </Badge>
                )}
            </div>
            {isMeal && mealItem.description && (
              <p className="text-sm text-gray-500">{mealItem.description}</p>
            )}
            {isFood && foodItem.default_variant && (
              <>
                <NutrientGrid
                  food={foodItem.default_variant}
                  visibleNutrients={nutrientConfig.visibleNutrients}
                  energyUnit={nutrientConfig.energyUnit}
                  convertEnergy={nutrientConfig.convertEnergy}
                  getEnergyUnitString={nutrientConfig.getEnergyUnitString}
                  customNutrients={nutrientConfig.customNutrients}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Per {formatServingLabel(foodItem.default_variant)}
                </p>
                <AllergenBadges
                  allergens={foodItem.default_variant.allergens}
                  traces={foodItem.default_variant.traces}
                />
              </>
            )}
          </div>
          <div className="flex items-center space-x-2 ml-2 shrink-0">
            {isFavorite && (
              <Star
                className="h-4 w-4 shrink-0 fill-current text-yellow-500"
                aria-label={t('enhancedFoodSearch.favorite', 'Favorite')}
              />
            )}
            {isOnline && onEditClick && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditClick();
                }}
              >
                <Edit className="w-4 h-4 mr-1" />
                {t('enhancedFoodSearch.editAndAdd', 'Edit & Add')}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
      <ImageLightbox
        images={galleryImages}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        title={item.name}
      />
    </Card>
  );
};

export default FoodResultCard;
