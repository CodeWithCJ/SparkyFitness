import { ChevronLeft, Settings } from 'lucide-react';
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
  return (
    <div className="bg-[#1c1c1e] rounded-2xl border border-gray-800 mb-6">
      <button
        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
        className="w-full p-4 flex items-center justify-between hover:bg-[#2c2c2e] transition-colors rounded-2xl"
      >
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-gray-400" />
          <span className="text-white font-semibold">Calculation Settings</span>
        </div>
        <ChevronLeft
          className={`h-5 w-5 text-gray-400 transition-transform ${showAdvancedSettings ? '-rotate-90' : 'rotate-180'}`}
        />
      </button>

      {showAdvancedSettings && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-800 pt-4">
          {/* Fat Breakdown Algorithm */}
          <div>
            <Label className="text-gray-300 text-sm mb-2 block">
              Fat Breakdown Method
            </Label>
            <Select
              value={localFatBreakdownAlgorithm}
              onValueChange={(value) =>
                setLocalFatBreakdownAlgorithm(value as FatBreakdownAlgorithm)
              }
            >
              <SelectTrigger className="bg-[#2c2c2e] border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(FatBreakdownAlgorithm).map((algo) => (
                  <SelectItem key={algo} value={algo}>
                    {FatBreakdownAlgorithmLabels[algo]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mineral Calculation Algorithm */}
          <div>
            <Label className="text-gray-300 text-sm mb-2 block">
              Mineral Calculation
            </Label>
            <Select
              value={localMineralAlgorithm}
              onValueChange={(value) =>
                setLocalMineralAlgorithm(value as MineralCalculationAlgorithm)
              }
            >
              <SelectTrigger className="bg-[#2c2c2e] border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(MineralCalculationAlgorithm).map((algo) => (
                  <SelectItem key={algo} value={algo}>
                    {MineralCalculationAlgorithmLabels[algo]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vitamin Calculation Algorithm */}
          <div>
            <Label className="text-gray-300 text-sm mb-2 block">
              Vitamin Calculation
            </Label>
            <Select
              value={localVitaminAlgorithm}
              onValueChange={(value) =>
                setLocalVitaminAlgorithm(value as VitaminCalculationAlgorithm)
              }
            >
              <SelectTrigger className="bg-[#2c2c2e] border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(VitaminCalculationAlgorithm).map((algo) => (
                  <SelectItem key={algo} value={algo}>
                    {VitaminCalculationAlgorithmLabels[algo]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sugar Calculation Algorithm */}
          <div>
            <Label className="text-gray-300 text-sm mb-2 block">
              Sugar Recommendation
            </Label>
            <Select
              value={localSugarAlgorithm}
              onValueChange={(value) =>
                setLocalSugarAlgorithm(value as SugarCalculationAlgorithm)
              }
            >
              <SelectTrigger className="bg-[#2c2c2e] border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(SugarCalculationAlgorithm).map((algo) => (
                  <SelectItem key={algo} value={algo}>
                    {SugarCalculationAlgorithmLabels[algo]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            These settings control how your nutrient goals are calculated. You
            can change them later in Settings.
          </p>
        </div>
      )}
    </div>
  );
};
