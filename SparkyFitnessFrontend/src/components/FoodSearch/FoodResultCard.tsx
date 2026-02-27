import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Share2 } from 'lucide-react';
import { NutrientGrid } from './NutrientGrid';
import type { Food } from '@/types/food';
import type { Meal } from '@/types/meal';
import type { UserCustomNutrient } from '@/types/customNutrient';
import { useTranslation } from 'react-i18next';

interface NutrientGridConfig {
  visibleNutrients: string[];
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (val: number, from: string, to: string) => number;
  getEnergyUnitString: (unit: string) => string;
  customNutrients: UserCustomNutrient[];
}

interface FoodResultCardProps {
  item: Food | Meal;
  isMeal?: boolean;
  isOnline?: boolean;
  providerLabel?: string;
  imageUrl?: string;
  activeUserId?: string;
  nutrientConfig: NutrientGridConfig;
  onCardClick?: () => void;
  onEditClick?: () => void;
}

const FoodResultCard = ({
  item,
  isMeal = false,
  isOnline = false,
  providerLabel,
  imageUrl,
  activeUserId,
  nutrientConfig,
  onCardClick,
  onEditClick,
}: FoodResultCardProps) => {
  const { t } = useTranslation();
  const isFood = !isMeal;
  const foodItem = item as Food;
  const mealItem = item as Meal;

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
                <Badge variant="outline" className="text-xs">
                  {providerLabel}
                </Badge>
              )}
              {isFood && !isOnline && foodItem.user_id === activeUserId && (
                <Badge variant="outline" className="text-xs">
                  {t('enhancedFoodSearch.private', 'Private')}
                </Badge>
              )}
              {isFood && !isOnline && foodItem.shared_with_public && (
                <Badge variant="outline" className="text-xs">
                  <Share2 className="h-3 w-3 mr-1" />
                  {t('enhancedFoodSearch.public', 'Public')}
                </Badge>
              )}
              {isFood &&
                !isOnline &&
                foodItem.user_id !== activeUserId &&
                !foodItem.shared_with_public && (
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
                  Per {foodItem.default_variant.serving_size}
                  {foodItem.default_variant.serving_unit}
                </p>
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
