import { ChevronLeft, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  FatBreakdownAlgorithm,
  FatBreakdownAlgorithmLabels,
  MineralCalculationAlgorithm,
  MineralCalculationAlgorithmLabels,
  VitaminCalculationAlgorithm,
  VitaminCalculationAlgorithmLabels,
  SugarCalculationAlgorithm,
  SugarCalculationAlgorithmLabels,
} from '@/types/nutrientAlgorithms';

export interface CalculationSettingsProps {
  localFatBreakdownAlgorithm: FatBreakdownAlgorithm;
  localMineralAlgorithm: MineralCalculationAlgorithm;
  localSugarAlgorithm: SugarCalculationAlgorithm;
  localVitaminAlgorithm: VitaminCalculationAlgorithm;
  setLocalFatBreakdownAlgorithm: React.Dispatch<
    React.SetStateAction<FatBreakdownAlgorithm>
  >;
  setLocalMineralAlgorithm: React.Dispatch<
    React.SetStateAction<MineralCalculationAlgorithm>
  >;
  setLocalSugarAlgorithm: React.Dispatch<
    React.SetStateAction<SugarCalculationAlgorithm>
  >;
  setLocalVitaminAlgorithm: React.Dispatch<
    React.SetStateAction<VitaminCalculationAlgorithm>
  >;
  setShowAdvancedSettings: React.Dispatch<React.SetStateAction<boolean>>;
  showAdvancedSettings: boolean;
}
export const CalculationSettings = ({
  localFatBreakdownAlgorithm,
  localMineralAlgorithm,
  localSugarAlgorithm,
  localVitaminAlgorithm,
  setLocalFatBreakdownAlgorithm,
  setLocalMineralAlgorithm,
  setLocalSugarAlgorithm,
  setLocalVitaminAlgorithm,
  setShowAdvancedSettings,
  showAdvancedSettings,
}: CalculationSettingsProps) => {
  const { t } = useTranslation();
  return (
    <div className="bg-card rounded-2xl border border-border mb-6">
      <button
        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
        className="w-full p-4 flex items-center justify-between hover:bg-muted transition-colors rounded-2xl"
      >
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <span className="text-foreground font-semibold">
            {t('settings.calculationSettings.title', 'Calculation Settings')}
          </span>
        </div>
        <ChevronLeft
          className={`h-5 w-5 text-muted-foreground transition-transform ${showAdvancedSettings ? '-rotate-90' : 'rotate-180'}`}
        />
      </button>

      {showAdvancedSettings && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          {/* Fat Breakdown Algorithm */}
          <div>
            <Label className="text-foreground text-sm mb-2 block">
              {t(
                'onboarding.personalPlan.fatBreakdownMethod',
                'Fat Breakdown Method'
              )}
            </Label>
            <Select
              value={localFatBreakdownAlgorithm}
              onValueChange={(value) =>
                setLocalFatBreakdownAlgorithm(value as FatBreakdownAlgorithm)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(FatBreakdownAlgorithm).map((algo) => (
                  <SelectItem key={algo} value={algo}>
                    {t(
                      `nutrientAlgorithms.fatBreakdown.${algo}`,
                      FatBreakdownAlgorithmLabels[algo]
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mineral Calculation Algorithm */}
          <div>
            <Label className="text-foreground text-sm mb-2 block">
              {t(
                'onboarding.personalPlan.mineralCalculation',
                'Mineral Calculation'
              )}
            </Label>
            <Select
              value={localMineralAlgorithm}
              onValueChange={(value) =>
                setLocalMineralAlgorithm(value as MineralCalculationAlgorithm)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(MineralCalculationAlgorithm).map((algo) => (
                  <SelectItem key={algo} value={algo}>
                    {t(
                      `nutrientAlgorithms.mineral.${algo}`,
                      MineralCalculationAlgorithmLabels[algo]
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vitamin Calculation Algorithm */}
          <div>
            <Label className="text-foreground text-sm mb-2 block">
              {t(
                'onboarding.personalPlan.vitaminCalculation',
                'Vitamin Calculation'
              )}
            </Label>
            <Select
              value={localVitaminAlgorithm}
              onValueChange={(value) =>
                setLocalVitaminAlgorithm(value as VitaminCalculationAlgorithm)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(VitaminCalculationAlgorithm).map((algo) => (
                  <SelectItem key={algo} value={algo}>
                    {t(
                      `nutrientAlgorithms.vitamin.${algo}`,
                      VitaminCalculationAlgorithmLabels[algo]
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sugar Calculation Algorithm */}
          <div>
            <Label className="text-foreground text-sm mb-2 block">
              {t(
                'onboarding.personalPlan.sugarRecommendation',
                'Sugar Recommendation'
              )}
            </Label>
            <Select
              value={localSugarAlgorithm}
              onValueChange={(value) =>
                setLocalSugarAlgorithm(value as SugarCalculationAlgorithm)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(SugarCalculationAlgorithm).map((algo) => (
                  <SelectItem key={algo} value={algo}>
                    {t(
                      `nutrientAlgorithms.sugar.${algo}`,
                      SugarCalculationAlgorithmLabels[algo]
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            {t(
              'onboarding.personalPlan.calculationSettingsHint',
              'These settings control how your nutrient goals are calculated. You can change them later in Settings.'
            )}
          </p>
        </div>
      )}
    </div>
  );
};
