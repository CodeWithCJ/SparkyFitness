import React from 'react';
import { usePreferences } from "@/contexts/PreferencesContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { toast } from "@/hooks/use-toast";

const Settings = () => {
  const { t } = useTranslation();
  const { energyUnit, setEnergyUnit, saveAllPreferences } = usePreferences();

  const handleEnergyUnitChange = async (unit: 'kcal' | 'kJ') => {
    try {
      await setEnergyUnit(unit);
      await saveAllPreferences(); // Persist the change
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

  return (
    <div className="space-y-6 p-4 md:p-8">
      <h1 className="text-3xl font-bold">{t("settings.title", "Settings")}</h1>

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
          {/* Other unit settings could go here */}
        </CardContent>
      </Card>

      {/* Other settings cards could go here (e.g., profile, notifications, etc.) */}
    </div>
  );
};

export default Settings;
