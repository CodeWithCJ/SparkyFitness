import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Share2, Sparkles } from 'lucide-react';
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
  imageUrl?: string;
  nutrientConfig: NutrientGridConfig;
  onCardClick?: () => void;
  onEditClick?: () => void;
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
}: FoodResultCardProps) => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const isFood = !isMeal;
  const foodItem = item as Food;
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
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
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
            {imageUrl && (
              <img
                src={imageUrl}
                alt={item.name}
                className="w-16 h-16 object-cover rounded-md mr-4"
              />
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
          {isOnline && onEditClick && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEditClick();
              }}
              className="ml-2"
            >
              <Edit className="w-4 h-4 mr-1" />
              {t('enhancedFoodSearch.editAndAdd', 'Edit & Add')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default FoodResultCard;
