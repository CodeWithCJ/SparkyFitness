import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Edit, Share2, Sparkles } from 'lucide-react';
import { NutrientGrid } from './NutrientGrid';
import AllergenBadges from '@/components/AllergenBadges';
import type { Food } from '@/types/food';
import type { Meal } from '@/types/meal';
import type { UserCustomNutrient } from '@/types/customNutrient';
import { useTranslation } from 'react-i18next';
import { EnergyUnit } from '@/contexts/PreferencesContext';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  CONFIDENCE_TONES,
  OVERALL_CONFIDENCE_LABELS,
  type AiConfidence,
  type ConfidenceTone,
} from '@workspace/shared';
import { getLocalizedUnitLabel } from '@/utils/unitLocalization';

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
  const confidence = foodItem.default_variant?.ai_confidence
    ? t(
        `foodUnitSelector.confidence.${foodItem.default_variant.ai_confidence}`,
        {
          defaultValue:
            OVERALL_CONFIDENCE_LABELS[
              foodItem.default_variant.ai_confidence as AiConfidence
            ],
        }
      )
    : '';
  const glycemicIndex = foodItem.default_variant?.glycemic_index;
  const glycemicKey = glycemicIndex
    ? glycemicIndex
        .toLowerCase()
        .replace(/\s+(\w)/g, (_, letter: string) => letter.toUpperCase())
    : '';

  return (
    <Card
      className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${onCardClick ? 'cursor-pointer' : ''}`}
      onClick={onCardClick}
      role={onCardClick ? 'button' : undefined}
      tabIndex={onCardClick ? 0 : undefined}
      aria-label={
        onCardClick
          ? t('foodResultCard.openItem', {
              itemName: item.name,
              defaultValue: 'Open {{itemName}}',
            })
          : undefined
      }
      onKeyDown={(event) => {
        if (onCardClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onCardClick();
        }
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
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
                <Badge
                  variant="outline"
                  className="gap-1 bg-emerald-50 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  <CheckCircle className="h-3 w-3" />
                  {t('enhancedFoodSearch.verified', 'Verified')}
                </Badge>
              )}
              {isFood &&
                foodItem.default_variant?.source === 'ai_estimate' &&
                foodItem.default_variant.ai_confidence && (
                  <Badge
                    variant="outline"
                    className={`gap-1 text-xs ${AI_BADGE_TONE_CLASSES[CONFIDENCE_TONES[foodItem.default_variant.ai_confidence as AiConfidence]]}`}
                  >
                    <Sparkles className="h-3 w-3" />
                    {t('foodResultCard.aiEstimate', {
                      confidence,
                      defaultValue: 'AI estimate ({{confidence}} confidence)',
                    })}
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
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Share2 className="h-3 w-3" />
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
              {isFood && glycemicIndex && glycemicIndex !== 'None' && (
                <Badge variant="outline" className="text-xs">
                  {t('foodDiary.glycemicIndex', {
                    value: t(
                      `foodDiary.glycemic.${glycemicKey}`,
                      glycemicIndex
                    ),
                  })}
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
                className="me-4 h-16 w-16 rounded-md object-cover"
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
                  {t('mealManagement.perServing', {
                    servingSize: foodItem.default_variant.serving_size,
                    servingUnit: getLocalizedUnitLabel(
                      foodItem.default_variant.serving_unit,
                      t
                    ),
                    defaultValue: 'Per {{servingSize}} {{servingUnit}}',
                  })}
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
              type="button"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEditClick();
              }}
              className="ms-2"
            >
              <Edit className="h-4 w-4" />
              {t('enhancedFoodSearch.editAndAdd', 'Edit & Add')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default FoodResultCard;
