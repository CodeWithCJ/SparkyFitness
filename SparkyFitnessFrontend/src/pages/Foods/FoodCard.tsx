import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';

import { Badge } from '@/components/ui/badge';
import type { Food, FoodVariant } from '@/types/food';
import { useTranslation } from 'react-i18next';
import { Edit, Trash2, Share2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FoodCardProps {
  food: Food;
  isMobile: boolean;
  visibleNutrients: string[];
  userId: string | undefined;
  canEdit: (food: Food) => boolean;
  onEdit: (food: Food) => void;
  onDelete: (food: Food) => void;
  onTogglePublic: (args: { foodId: string; currentState: boolean }) => void;
}

export const FoodCard = ({
  food,
  isMobile,
  userId,
  visibleNutrients,
  canEdit,
  onEdit,
  onDelete,
  onTogglePublic,
}: FoodCardProps) => {
  const { t } = useTranslation();
  const getFoodSourceBadge = (food: Food) => {
    if (!food.user_id) {
      return (
        <Badge variant="outline" className="text-xs w-fit">
          {t('foodDatabaseManager.system', 'System')}
        </Badge>
      );
    }
    if (food.user_id === userId) {
      return (
        <Badge variant="secondary" className="text-xs w-fit">
          {t('foodDatabaseManager.private', 'Private')}
        </Badge>
      );
    }
    if (food.user_id !== userId && !food.shared_with_public) {
      return (
        <Badge
          variant="outline"
          className="text-xs w-fit bg-blue-50 text-blue-700"
        >
          {t('foodDatabaseManager.family', 'Family')}
        </Badge>
      );
    }
    return null; // No badge from getFoodSourceBadge if it's public and not owned by user
  };

  return (
    <div
      key={food.id}
      className="flex flex-col p-2 bg-gray-50 dark:bg-gray-800 rounded-lg gap-2"
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-medium text-base">{food.name}</span>
            {food.brand && (
              <Badge variant="secondary" className="text-xs w-fit h-5 px-1.5">
                {food.brand}
              </Badge>
            )}
            {getFoodSourceBadge(food)}
            {food.shared_with_public && (
              <Badge
                variant="outline"
                className="text-xs w-fit bg-green-50 text-green-700 h-5 px-1.5"
              >
                <Share2 className="h-3 w-3 mr-1" />
                {t('foodDatabaseManager.public', 'Public')}
              </Badge>
            )}
          </div>
        </div>
        {/* Action Buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Share/Lock Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() =>
                    onTogglePublic({
                      foodId: food.id,
                      currentState: food.shared_with_public || false,
                    })
                  }
                  disabled={!canEdit(food)} // Disable if not editable
                >
                  {food.shared_with_public ? (
                    <Share2 className="w-4 h-4" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {canEdit(food)
                    ? food.shared_with_public
                      ? t('foodDatabaseManager.makePrivate', 'Make private')
                      : t(
                          'foodDatabaseManager.shareWithPublic',
                          'Share with public'
                        )
                    : t('foodDatabaseManager.notEditable', 'Not editable')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Edit Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => onEdit(food)}
                  disabled={!canEdit(food)} // Disable if not editable
                >
                  <Edit className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {canEdit(food)
                    ? t('foodDatabaseManager.editFood', 'Edit food')
                    : t('foodDatabaseManager.notEditable', 'Not editable')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Delete Button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => onDelete(food)}
                  disabled={!canEdit(food)} // Disable if not editable
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {canEdit(food)
                    ? t('foodDatabaseManager.deleteFood', 'Delete food')
                    : t('foodDatabaseManager.notEditable', 'Not editable')}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="text-xs text-gray-500 ml-2 mt-1">
          {t('foodDatabaseManager.perServing', {
            servingSize: food.default_variant?.serving_size || 0,
            servingUnit: food.default_variant?.serving_unit || '',
            defaultValue: `Per ${food.default_variant?.serving_size || 0} ${food.default_variant?.serving_unit || ''}`,
          })}
        </div>
      </div>
      <div className="mt-1">
        <div
          className="grid gap-y-1 gap-x-2 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-1.5"
          style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? '60px' : '70px'}, 1fr))`,
          }}
        >
          {visibleNutrients.map((nutrient) => {
            const meta = getNutrientMetadata(nutrient);
            const value =
              (food.default_variant?.[
                nutrient as keyof FoodVariant
              ] as number) ||
              (food.default_variant?.custom_nutrients?.[nutrient] as number) ||
              0;

            return (
              <div key={nutrient} className="flex flex-col">
                <span className={`font-medium text-sm ${meta.color}`}>
                  {formatNutrientValue(nutrient, value, [])}
                  <span className="text-xs ml-0.5 text-gray-500">
                    {meta.unit}
                  </span>
                </span>
                <span
                  className="text-xs text-gray-500 truncate"
                  title={t(meta.label, meta.defaultLabel)}
                >
                  {t(meta.label, meta.defaultLabel)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
