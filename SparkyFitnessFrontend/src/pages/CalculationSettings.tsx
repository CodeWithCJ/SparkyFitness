import React, { useState, useEffect } from 'react';
import { BmrAlgorithm } from '../services/bmrService';
import { BodyFatAlgorithm } from '../services/bodyCompositionService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { usePreferences } from "@/contexts/PreferencesContext";
import { info, error as logError } from '@/utils/logging';
import { useTranslation } from "react-i18next";
import {
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  SugarCalculationAlgorithm,
  FatBreakdownAlgorithmLabels,
  MineralCalculationAlgorithmLabels,
  VitaminCalculationAlgorithmLabels,
  SugarCalculationAlgorithmLabels,
} from '@/types/nutrientAlgorithms';

const CalculationSettings = () => {
  const { t } = useTranslation();
  const {
    energyUnit,
    setEnergyUnit,
    bmrAlgorithm: contextBmrAlgorithm,
    bodyFatAlgorithm: contextBodyFatAlgorithm,
    includeBmrInNetCalories: contextIncludeBmrInNetCalories,
    fatBreakdownAlgorithm: contextFatBreakdownAlgorithm,
    mineralCalculationAlgorithm: contextMineralCalculationAlgorithm,
    vitaminCalculationAlgorithm: contextVitaminCalculationAlgorithm,
    sugarCalculationAlgorithm: contextSugarCalculationAlgorithm,
    saveAllPreferences,
    loggingLevel
  } = usePreferences();

  const [bmrAlgorithm, setBmrAlgorithm] = useState<BmrAlgorithm>(contextBmrAlgorithm || BmrAlgorithm.MIFFLIN_ST_JEOR);
  const [bodyFatAlgorithm, setBodyFatAlgorithm] = useState<BodyFatAlgorithm>(contextBodyFatAlgorithm || BodyFatAlgorithm.US_NAVY);
  const [includeBmrInNetCalories, setIncludeBmrInNetCalories] = useState(contextIncludeBmrInNetCalories || false);
  const [fatBreakdownAlgorithm, setFatBreakdownAlgorithm] = useState<FatBreakdownAlgorithm>(contextFatBreakdownAlgorithm || FatBreakdownAlgorithm.AHA_GUIDELINES);
  const [mineralCalculationAlgorithm, setMineralCalculationAlgorithm] = useState<MineralCalculationAlgorithm>(contextMineralCalculationAlgorithm || MineralCalculationAlgorithm.RDA_STANDARD);
  const [vitaminCalculationAlgorithm, setVitaminCalculationAlgorithm] = useState<VitaminCalculationAlgorithm>(contextVitaminCalculationAlgorithm || VitaminCalculationAlgorithm.RDA_STANDARD);
  const [sugarCalculationAlgorithm, setSugarCalculationAlgorithm] = useState<SugarCalculationAlgorithm>(contextSugarCalculationAlgorithm || SugarCalculationAlgorithm.WHO_GUIDELINES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // When context preferences are loaded, update local state
    if (contextBmrAlgorithm) {
      setBmrAlgorithm(contextBmrAlgorithm);
    }
    if (contextBodyFatAlgorithm) {
      setBodyFatAlgorithm(contextBodyFatAlgorithm);
    }
    if (contextIncludeBmrInNetCalories !== undefined) {
      setIncludeBmrInNetCalories(contextIncludeBmrInNetCalories);
    }
    if (contextFatBreakdownAlgorithm) {
      setFatBreakdownAlgorithm(contextFatBreakdownAlgorithm);
    }
    if (contextMineralCalculationAlgorithm) {
      setMineralCalculationAlgorithm(contextMineralCalculationAlgorithm);
    }
    if (contextVitaminCalculationAlgorithm) {
      setVitaminCalculationAlgorithm(contextVitaminCalculationAlgorithm);
    }
    if (contextSugarCalculationAlgorithm) {
      setSugarCalculationAlgorithm(contextSugarCalculationAlgorithm);
    }
    // Since preferences are loaded by the PreferencesProvider at a higher level,
    // we can assume they are available by the time this component renders.
    // Set isLoading to false after initial render with context values.
    setIsLoading(false);
  }, [contextBmrAlgorithm, contextBodyFatAlgorithm, contextIncludeBmrInNetCalories, contextFatBreakdownAlgorithm, contextMineralCalculationAlgorithm, contextVitaminCalculationAlgorithm, contextSugarCalculationAlgorithm]);


  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveAllPreferences({
        bmrAlgorithm,
        bodyFatAlgorithm,
        includeBmrInNetCalories,
        energyUnit, // Ensure energyUnit is included in saving
        fatBreakdownAlgorithm: fatBreakdownAlgorithm,
        mineralCalculationAlgorithm: mineralCalculationAlgorithm,
        vitaminCalculationAlgorithm: vitaminCalculationAlgorithm,
        sugarCalculationAlgorithm: sugarCalculationAlgorithm,
      });
      toast({
        title: t("calculationSettings.saveSuccess", "Success"),
        description: t("calculationSettings.saveSuccessDesc", "Calculation settings saved successfully!"),
      });
    } catch (error) {
      logError(loggingLevel, "Failed to save user preferences:", error);
      toast({
        title: t("calculationSettings.saveError", "Error"),
        description: t("calculationSettings.saveErrorDesc", "Failed to save calculation settings."),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnergyUnitChange = async (unit: 'kcal' | 'kJ') => {
    try {
      await setEnergyUnit(unit);
      toast({
        title: t("calculationSettings.energyUnitSaveSuccess", "Success"),
        description: t("calculationSettings.energyUnitSaveSuccessDesc", "Energy unit updated successfully."),
      });
    } catch (error) {
      logError(loggingLevel, "Failed to update energy unit:", error);
      toast({
        title: t("calculationSettings.energyUnitSaveError", "Error"),
        description: t("calculationSettings.energyUnitSaveErrorDesc", "Failed to update energy unit."),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <div>{t("common.loading", "Loading...")}</div>;
  }

  return (
    <Card className="p-4">
      <CardHeader className="p-0 mb-4">
        <CardTitle className="text-2xl font-bold">{t("calculationSettings.title", "Calculation Settings")}</CardTitle>
        <CardDescription>{t("calculationSettings.description", "Manage BMR, Body Fat calculation, and unit preferences.")}</CardDescription>
      </CardHeader>
      <CardContent className="p-0 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="bmr-algorithm">{t("calculationSettings.bmrAlgorithm", "BMR Algorithm")}</Label>
            <Select
              value={bmrAlgorithm}
              onValueChange={(value: BmrAlgorithm) => setBmrAlgorithm(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("calculationSettings.selectBmrAlgorithm", "Select BMR Algorithm")} />
              </SelectTrigger>
              <SelectContent>
                {Object.values(BmrAlgorithm).map(alg => (
                  <SelectItem key={alg} value={alg}>{alg}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">{t("calculationSettings.bmrAlgorithmHint", "Select the formula used to calculate your Basal Metabolic Rate.")}</p>
          </div>

          <div>
            <Label htmlFor="bodyfat-algorithm">{t("calculationSettings.bodyFatAlgorithm", "Body Fat Algorithm")}</Label>
            <Select
              value={bodyFatAlgorithm}
              onValueChange={(value: BodyFatAlgorithm) => setBodyFatAlgorithm(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("calculationSettings.selectBodyFatAlgorithm", "Select Body Fat Algorithm")} />
              </SelectTrigger>
              <SelectContent>
                {Object.values(BodyFatAlgorithm).map(alg => (
                  <SelectItem key={alg} value={alg}>{alg}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">{t("calculationSettings.bodyFatAlgorithmHint", "Select the formula used to estimate body fat percentage from measurements.")}</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="include-bmr"
            checked={includeBmrInNetCalories}
            onCheckedChange={(checked) => setIncludeBmrInNetCalories(Boolean(checked))}
          />
          <div className="grid gap-1.5 leading-none">
            <Label
              htmlFor="include-bmr"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              {t("calculationSettings.includeBmrInNetCalories", "Include BMR in Net Calories")}
            </Label>
            <p className="text-sm text-muted-foreground">{t("calculationSettings.includeBmrInNetCaloriesHint", "When enabled, your BMR will be subtracted from your daily net calorie total.")}</p>
          </div>
        </div>

        {/* Energy Unit Toggle */}
        <div className="grid gap-2">
          <Label htmlFor="energy-unit">{t("calculationSettings.energyUnitLabel", "Energy Unit")}</Label>
          <Select value={energyUnit} onValueChange={handleEnergyUnitChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("calculationSettings.selectEnergyUnitPlaceholder", "Select energy unit")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kcal">kcal ({t("calculationSettings.calories", "Calories")})</SelectItem>
              <SelectItem value="kJ">kJ ({t("calculationSettings.joules", "Joules")})</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {t("calculationSettings.energyUnitHint", "Choose your preferred unit for displaying energy values (e.g., calories, kilojoules).")}
          </p>
        </div>

        {/* Nutrient Calculation Algorithms */}
        <div className="border-t pt-4 mt-4">
          <h3 className="text-lg font-semibold mb-4">Nutrient Calculation Algorithms</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fat-breakdown-algorithm">Fat Breakdown Algorithm</Label>
              <Select
                value={fatBreakdownAlgorithm}
                onValueChange={(value: FatBreakdownAlgorithm) => setFatBreakdownAlgorithm(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Fat Breakdown Algorithm" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(FatBreakdownAlgorithm).map(alg => (
                    <SelectItem key={alg} value={alg}>{FatBreakdownAlgorithmLabels[alg]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">How to distribute dietary fat into saturated, poly, mono, and trans fats.</p>
            </div>

            <div>
              <Label htmlFor="mineral-calculation-algorithm">Mineral Calculation Algorithm</Label>
              <Select
                value={mineralCalculationAlgorithm}
                onValueChange={(value: MineralCalculationAlgorithm) => setMineralCalculationAlgorithm(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Mineral Algorithm" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(MineralCalculationAlgorithm).map(alg => (
                    <SelectItem key={alg} value={alg}>{MineralCalculationAlgorithmLabels[alg]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">Algorithm for calculating sodium, potassium, calcium, iron, and cholesterol targets.</p>
            </div>

            <div>
              <Label htmlFor="vitamin-calculation-algorithm">Vitamin Calculation Algorithm</Label>
              <Select
                value={vitaminCalculationAlgorithm}
                onValueChange={(value: VitaminCalculationAlgorithm) => setVitaminCalculationAlgorithm(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Vitamin Algorithm" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(VitaminCalculationAlgorithm).map(alg => (
                    <SelectItem key={alg} value={alg}>{VitaminCalculationAlgorithmLabels[alg]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">Algorithm for calculating Vitamin A and C targets.</p>
            </div>

            <div>
              <Label htmlFor="sugar-calculation-algorithm">Sugar Calculation Algorithm</Label>
              <Select
                value={sugarCalculationAlgorithm}
                onValueChange={(value: SugarCalculationAlgorithm) => setSugarCalculationAlgorithm(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Sugar Algorithm" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(SugarCalculationAlgorithm).map(alg => (
                    <SelectItem key={alg} value={alg}>{SugarCalculationAlgorithmLabels[alg]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground mt-1">Maximum sugar intake as a percentage of total calories.</p>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? t("common.saving", "Saving...") : t("common.savePreferences", "Save Preferences")}
        </Button>
      </CardContent>
    </Card>
  );
};

export default CalculationSettings;