import { ChevronDown, Settings } from 'lucide-react';
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
  MineralCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  SugarCalculationAlgorithm,
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
  const algorithmLabel = (algorithm: string) =>
    t(`onboarding.calculationSettingsAlgorithms.${algorithm}`);

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
        className="flex w-full items-center justify-between rounded-2xl p-4 transition-colors hover:bg-muted"
        aria-expanded={showAdvancedSettings}
        aria-controls="advanced-calculation-settings"
      >
        <span className="flex items-center gap-2">
          <Settings
            className="h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="font-semibold text-foreground">
            {t('onboarding.calculationSettingsTitle')}
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground transition-transform ${showAdvancedSettings ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {showAdvancedSettings && (
        <div
          id="advanced-calculation-settings"
          className="space-y-4 border-t border-border px-4 pb-4 pt-4"
        >
          {/* Fat Breakdown Algorithm */}
          <div>
            <Label
              htmlFor="fat-breakdown-algorithm"
              className="mb-2 block text-sm text-foreground"
            >
              {t('onboarding.calculationSettingsFatMethod')}
            </Label>
            <Select
              value={localFatBreakdownAlgorithm}
              onValueChange={(value) =>
                setLocalFatBreakdownAlgorithm(value as FatBreakdownAlgorithm)
              }
            >
              <SelectTrigger
                id="fat-breakdown-algorithm"
                aria-label={t('onboarding.calculationSettingsFatMethod')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(FatBreakdownAlgorithm).map((algo) => (
                  <SelectItem key={algo} value={algo}>
                    {algorithmLabel(algo)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mineral Calculation Algorithm */}
          <div>
            <Label
              htmlFor="mineral-calculation-algorithm"
              className="mb-2 block text-sm text-foreground"
            >
              {t('onboarding.calculationSettingsMinerals')}
            </Label>
            <Select
              value={localMineralAlgorithm}
              onValueChange={(value) =>
                setLocalMineralAlgorithm(value as MineralCalculationAlgorithm)
              }
            >
              <SelectTrigger
                id="mineral-calculation-algorithm"
                aria-label={t('onboarding.calculationSettingsMinerals')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(MineralCalculationAlgorithm).map((algo) => (
                  <SelectItem key={algo} value={algo}>
                    {algorithmLabel(algo)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vitamin Calculation Algorithm */}
          <div>
            <Label
              htmlFor="vitamin-calculation-algorithm"
              className="mb-2 block text-sm text-foreground"
            >
              {t('onboarding.calculationSettingsVitamins')}
            </Label>
            <Select
              value={localVitaminAlgorithm}
              onValueChange={(value) =>
                setLocalVitaminAlgorithm(value as VitaminCalculationAlgorithm)
              }
            >
              <SelectTrigger
                id="vitamin-calculation-algorithm"
                aria-label={t('onboarding.calculationSettingsVitamins')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(VitaminCalculationAlgorithm).map((algo) => (
                  <SelectItem key={algo} value={algo}>
                    {algorithmLabel(algo)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sugar Calculation Algorithm */}
          <div>
            <Label
              htmlFor="sugar-calculation-algorithm"
              className="mb-2 block text-sm text-foreground"
            >
              {t('onboarding.calculationSettingsSugar')}
            </Label>
            <Select
              value={localSugarAlgorithm}
              onValueChange={(value) =>
                setLocalSugarAlgorithm(value as SugarCalculationAlgorithm)
              }
            >
              <SelectTrigger
                id="sugar-calculation-algorithm"
                aria-label={t('onboarding.calculationSettingsSugar')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(SugarCalculationAlgorithm).map((algo) => (
                  <SelectItem key={algo} value={algo}>
                    {algorithmLabel(algo)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {t('onboarding.calculationSettingsDescription')}
          </p>
        </div>
      )}
    </section>
  );
};
