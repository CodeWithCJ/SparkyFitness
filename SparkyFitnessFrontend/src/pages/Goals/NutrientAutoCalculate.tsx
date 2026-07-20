import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Calculator } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  isAutoCalculable,
  isSugarLikeName,
} from '@/pages/Goals/nutrientAutoCalculateHelpers';
import type { NutrientGoalType } from '@/constants/nutrients';
import {
  computeAutoCalculatedValue,
  getAutoCalculateFamily,
  type AlgorithmBundle,
  type UserNutrientData,
} from '@/services/nutrientCalculationService';
import {
  AddedSugarAlgorithmLabels,
  FatBreakdownAlgorithmLabels,
  MineralCalculationAlgorithmLabels,
  VitaminCalculationAlgorithmLabels,
  SugarCalculationAlgorithmLabels,
} from '@/types/nutrientAlgorithms';

const FAMILY_ALGORITHM_LABELS: Record<
  keyof Omit<AlgorithmBundle, 'addedSugar'>,
  Record<string, string>
> = {
  fatBreakdown: FatBreakdownAlgorithmLabels,
  minerals: MineralCalculationAlgorithmLabels,
  vitamins: VitaminCalculationAlgorithmLabels,
  sugar: SugarCalculationAlgorithmLabels,
};

interface NutrientAutoCalculateProps {
  // Standard field id (e.g. 'sodium') or a custom nutrient's name.
  nutrientId: string;
  // Only relevant for custom nutrients — used for the Added Sugars name match.
  customNutrientAliases?: string[];
  userData: UserNutrientData | null;
  // Effective goal direction for this nutrient; only gates the Added Sugars
  // case (a custom nutrient must be set to Maximum to be auto-calculable).
  goalType?: NutrientGoalType;
  algorithms: AlgorithmBundle;
  onApply: (value: number) => void;
  // Bulk-select checkbox, shown alongside the calculator icon so a field can
  // be included in "Auto-calculate Selected" without affecting the icon's
  // own standalone click-to-apply behavior.
  selected: boolean;
  onToggleSelected: (checked: boolean) => void;
}

export const NutrientAutoCalculate = ({
  nutrientId,
  customNutrientAliases,
  userData,
  goalType,
  algorithms,
  onApply,
  selected,
  onToggleSelected,
}: NutrientAutoCalculateProps) => {
  const { t } = useTranslation();

  const isAddedSugarLike =
    goalType === 'maximum' &&
    isSugarLikeName(nutrientId, customNutrientAliases);
  if (!isAutoCalculable(nutrientId, customNutrientAliases, goalType)) {
    return null;
  }

  const family = getAutoCalculateFamily(nutrientId);
  const algorithmLabel = family
    ? FAMILY_ALGORITHM_LABELS[family][algorithms[family]]
    : AddedSugarAlgorithmLabels[algorithms.addedSugar];

  const disabled = !userData;
  const handleClick = () => {
    if (!userData) return;
    const value = computeAutoCalculatedValue(
      nutrientId,
      userData,
      algorithms,
      isAddedSugarLike
    );
    if (value === null) return;
    onApply(Math.round(value));
  };

  return (
    <div className="flex items-center gap-1 mt-1">
      <Checkbox
        checked={selected}
        onCheckedChange={(checked) => onToggleSelected(Boolean(checked))}
        disabled={disabled}
        aria-label={t(
          'nutrition.autoCalculateSelect',
          'Include in bulk auto-calculate'
        )}
      />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={disabled}
              onClick={handleClick}
              aria-label={t('nutrition.autoCalculate', 'Auto-calculate')}
            >
              <Calculator className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {disabled
              ? t(
                  'nutrition.autoCalculateDisabledNoSex',
                  'Set your sex in Profile to enable auto-calculate'
                )
              : t(
                  'nutrition.autoCalculateTooltip',
                  'Auto-calculate using {{algorithm}}',
                  { algorithm: algorithmLabel }
                )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
