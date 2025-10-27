import React, { useState, useEffect } from 'react';
import { BmrAlgorithm } from '../services/bmrService';
import { BodyFatAlgorithm } from '../services/bodyCompositionService';
import { getUserPreferences, updateUserPreferences } from '../services/preferenceService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const CalculationSettings = () => {
  const [bmrAlgorithm, setBmrAlgorithm] = useState<BmrAlgorithm>(BmrAlgorithm.MIFFLIN_ST_JEOR);
  const [bodyFatAlgorithm, setBodyFatAlgorithm] = useState<BodyFatAlgorithm>(BodyFatAlgorithm.US_NAVY);
  const [includeBmrInNetCalories, setIncludeBmrInNetCalories] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const prefs = await getUserPreferences();
        if (prefs) {
          setBmrAlgorithm(prefs.bmr_algorithm as BmrAlgorithm || BmrAlgorithm.MIFFLIN_ST_JEOR);
          setBodyFatAlgorithm(prefs.body_fat_algorithm as BodyFatAlgorithm || BodyFatAlgorithm.US_NAVY);
          setIncludeBmrInNetCalories(prefs.include_bmr_in_net_calories || false);
        }
      } catch (error) {
        console.error("Failed to fetch user preferences:", error);
        toast({
          title: "Error",
          description: "Failed to load calculation settings.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreferences();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateUserPreferences({
        bmr_algorithm: bmrAlgorithm,
        body_fat_algorithm: bodyFatAlgorithm,
        include_bmr_in_net_calories: includeBmrInNetCalories,
      });
      toast({
        title: "Success",
        description: "Calculation settings saved successfully!",
      });
    } catch (error) {
      console.error("Failed to save user preferences:", error);
      toast({
        title: "Error",
        description: "Failed to save calculation settings.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Card className="p-4">
      <CardHeader className="p-0 mb-4">
        <CardTitle className="text-2xl font-bold">Calculation Settings</CardTitle>
        <CardDescription>Manage BMR and Body Fat calculation preferences</CardDescription>
      </CardHeader>
      <CardContent className="p-0 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="bmr-algorithm">BMR Algorithm</Label>
            <Select
              value={bmrAlgorithm}
              onValueChange={(value: BmrAlgorithm) => setBmrAlgorithm(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select BMR Algorithm" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(BmrAlgorithm).map(alg => (
                  <SelectItem key={alg} value={alg}>{alg}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">Select the formula used to calculate your Basal Metabolic Rate.</p>
          </div>

          <div>
            <Label htmlFor="bodyfat-algorithm">Body Fat Algorithm</Label>
            <Select
              value={bodyFatAlgorithm}
              onValueChange={(value: BodyFatAlgorithm) => setBodyFatAlgorithm(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Body Fat Algorithm" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(BodyFatAlgorithm).map(alg => (
                  <SelectItem key={alg} value={alg}>{alg}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">Select the formula used to estimate body fat percentage from measurements.</p>
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
              Include BMR in Net Calories
            </Label>
            <p className="text-sm text-muted-foreground">When enabled, your BMR will be subtracted from your daily net calorie total.</p>
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default CalculationSettings;