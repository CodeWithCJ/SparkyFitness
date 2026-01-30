import React from 'react';
import { usePreferences } from "@/contexts/PreferencesContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";
import { toast } from "@/hooks/use-toast";
import CustomNutrientsSettings from './CustomNutrientsSettings';
import PasskeySettings from '@/components/PasskeySettings';
import MFASettings from '@/components/MFASettings';

const Settings = () => {
  const { t } = useTranslation();
  const { energyUnit, setEnergyUnit, autoScaleOpenFoodFactsImports, setAutoScaleOpenFoodFactsImports, saveAllPreferences } = usePreferences();

  const handleEnergyUnitChange = async (unit: 'kcal' | 'kJ') => {
    try {
      await setEnergyUnit(unit);
      await saveAllPreferences();
      toast({
        title: t("settings.energyUnit.successTitle", "Success"),
        description: t("settings.energyUnit.successDescription", "Energy unit updated successfully."),
      });
    } catch (error) {
      console.error("Failed to update energy unit:", error);
      toast({
        title: t("settings.energyUnit.errorTitle", "Error"),
        description: t("settings.energyUnit.errorDescription", "Failed to update energy unit."),
        variant: "destructive",
      });
    }
  };

  const handleAutoScaleChange = async (enabled: boolean) => {
    try {
      await setAutoScaleOpenFoodFactsImports(enabled);
      toast({
        title: t("settings.autoScale.successTitle", "Success"),
        description: t("settings.autoScale.successDescription", "Auto-scale preference updated successfully."),
      });
    } catch (error) {
      console.error("Failed to update auto-scale preference:", error);
      toast({
        title: t("settings.autoScale.errorTitle", "Error"),
        description: t("settings.autoScale.errorDescription", "Failed to update auto-scale preference."),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <h1 className="text-3xl font-bold">{t("settings.title", "Settings")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Custom Nutrients</CardTitle>
          <CardDescription>Manage your custom nutrient definitions.</CardDescription>
        </CardHeader>
        <CardContent>
          <CustomNutrientsSettings />
        </CardContent>
      </Card>

      <PasskeySettings />

      <Card>
        <CardHeader>
          <CardTitle>MFA Settings</CardTitle>
          <CardDescription>Secure your account with Multi-Factor Authentication.</CardDescription>
        </CardHeader>
        <CardContent>
          <MFASettings />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.units.title", "Units")}</CardTitle>
          <CardDescription>{t("settings.units.description", "Manage your preferred units of measurement.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="energy-unit">{t("settings.units.energyUnitLabel", "Energy Unit")}</Label>
            <Select value={energyUnit} onValueChange={handleEnergyUnitChange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("settings.units.selectEnergyUnitPlaceholder", "Select energy unit")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kcal">kcal ({t("settings.units.calories", "Calories")})</SelectItem>
                <SelectItem value="kJ">kJ ({t("settings.units.joules", "Joules")})</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t("settings.units.energyUnitHint", "Choose your preferred unit for displaying energy values (e.g., calories, kilojoules).")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.foodImport.title", "Food Import")}</CardTitle>
          <CardDescription>{t("settings.foodImport.description", "Configure how food data is imported from external sources.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-scale-openfoodfacts">{t("settings.foodImport.autoScaleLabel", "Auto-scale OpenFoodFacts Imports")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.foodImport.autoScaleHint", "When enabled, nutrition values from OpenFoodFacts will be automatically scaled from per-100g to the product's serving size.")}
              </p>
            </div>
            <Switch
              id="auto-scale-openfoodfacts"
              checked={autoScaleOpenFoodFactsImports}
              onCheckedChange={handleAutoScaleChange}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
