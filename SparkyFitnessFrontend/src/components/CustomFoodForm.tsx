
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, warn, error } from '@/utils/logging';

import { GlycemicIndex } from "@/types/food";

interface CustomFood {
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat?: number;
  polyunsaturated_fat?: number;
  monounsaturated_fat?: number;
  trans_fat?: number;
  cholesterol?: number;
  sodium?: number;
  potassium?: number;
  dietary_fiber?: number;
  sugars?: number;
  vitamin_a?: number;
  vitamin_c?: number;
  calcium?: number;
  iron?: number;
  servingSize: number | ""; // Allow empty string
  servingUnit: string;
  is_quick_food?: boolean;
  glycemic_index?: GlycemicIndex;
}

interface CustomFoodFormProps {
  onSave: (food: CustomFood) => void;
}

const CustomFoodForm = ({ onSave }: CustomFoodFormProps) => {
 const { t } = useTranslation();
 const { loggingLevel } = usePreferences();
 debug(loggingLevel, "CustomFoodForm: Component rendered.");
 const [formData, setFormData] = useState<CustomFood>({
   name: "",
   brand: "",
   calories: 0,
   protein: 0,
   carbs: 0,
   fat: 0,
   saturated_fat: 0,
   polyunsaturated_fat: 0,
   monounsaturated_fat: 0,
   trans_fat: 0,
   cholesterol: 0,
   sodium: 0,
   potassium: 0,
   dietary_fiber: 0,
   sugars: 0,
   vitamin_a: 0,
   vitamin_c: 0,
   calcium: 0,
   iron: 0,
   servingSize: "", // Initial value allows empty string
   servingUnit: "g",
   is_quick_food: false,
   glycemic_index: "None", // Default to 'None'
 });
 const [servingSizeError, setServingSizeError] = useState<string | null>(null);
 
   const handleSubmit = (e: React.FormEvent) => {
     e.preventDefault();
     debug(loggingLevel, "CustomFoodForm: Handling form submission.");
 
     if (!formData.name.trim()) {
       warn(loggingLevel, "CustomFoodForm: Food name is empty, submission aborted.");
       return;
     }
 
     const parsedServingSize = Number(formData.servingSize); // Parse to number for validation
     if (parsedServingSize <= 0 || isNaN(parsedServingSize)) {
       setServingSizeError(t('customFoodForm.servingSizeError', "Serving size must be a positive number."));
       warn(loggingLevel, "CustomFoodForm: Serving size is invalid, submission aborted.");
       return;
     }
 
     setServingSizeError(null); // Clear any previous error
     
     info(loggingLevel, "CustomFoodForm: Saving custom food:", formData);
     onSave(formData);
     setFormData({
       name: "",
       brand: "",
       calories: 0,
       protein: 0,
       carbs: 0,
       fat: 0,
       saturated_fat: 0,
       polyunsaturated_fat: 0,
       monounsaturated_fat: 0,
       trans_fat: 0,
       cholesterol: 0,
       sodium: 0,
       potassium: 0,
       dietary_fiber: 0,
       sugars: 0,
       vitamin_a: 0,
       vitamin_c: 0,
       calcium: 0,
       iron: 0,
       servingSize: "", // Reset value allows empty string
       servingUnit: "g",
       is_quick_food: false,
       glycemic_index: "None",
     });
     info(loggingLevel, "CustomFoodForm: Form data reset.");
   };
 
  const handleInputChange = (field: keyof CustomFood, value: string | number | boolean | GlycemicIndex) => {
    debug(loggingLevel, `CustomFoodForm: Input change for field "${field}":`, value);
    setFormData(prev => {
      if (field === "servingSize") {
        // Allow empty string, but store as number if valid, otherwise keep as string
        return { ...prev, [field]: value === "" ? "" : Number(value) };
      }
      return { ...prev, [field]: value };
    });
  };
 
  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('customFoodForm.foodNameLabel', 'Food Name *')}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder={t('customFoodForm.foodNamePlaceholder', 'e.g., Homemade Pizza')}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="brand">{t('customFoodForm.brandLabel', 'Brand (optional)')}</Label>
              <Input
                id="brand"
                value={formData.brand}
                onChange={(e) => handleInputChange("brand", e.target.value)}
                placeholder={t('customFoodForm.brandPlaceholder', 'e.g., Homemade')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="glycemic_index">{t('customFoodForm.glycemicIndexLabel', 'Glycemic Index (GI)')}</Label>
              <Select
                value={formData.glycemic_index}
                onValueChange={(value: GlycemicIndex) => handleInputChange("glycemic_index", value)}
              >
                <SelectTrigger id="glycemic_index">
                  <SelectValue placeholder={t('customFoodForm.selectGIPlaceholder', 'Select GI')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">{t('customFoodForm.giNone', 'None')}</SelectItem>
                  <SelectItem value="Very Low">{t('customFoodForm.giVeryLow', 'Very Low')}</SelectItem>
                  <SelectItem value="Low">{t('customFoodForm.giLow', 'Low')}</SelectItem>
                  <SelectItem value="Medium">{t('customFoodForm.giMedium', 'Medium')}</SelectItem>
                  <SelectItem value="High">{t('customFoodForm.giHigh', 'High')}</SelectItem>
                  <SelectItem value="Very High">{t('customFoodForm.giVeryHigh', 'Very High')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
 
          <div className="flex items-center space-x-2 pt-4">
            <Checkbox
              id="is_quick_food"
              checked={formData.is_quick_food}
              onCheckedChange={(checked) => handleInputChange("is_quick_food", !!checked)}
            />
            <Label htmlFor="is_quick_food" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              {t('customFoodForm.quickAddLabel', "Quick Add (don't save to my food list for future use)")}
            </Label>
          </div>
 
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="servingSize">{t('customFoodForm.servingSizeLabel', 'Serving Size')}</Label>
              <Input
                id="servingSize"
                type="number"
                value={formData.servingSize}
                onChange={(e) => handleInputChange("servingSize", e.target.value)} // Pass raw string
                onBlur={(e) => { // Convert to number on blur if not empty
                   const val = e.target.value;
                   if (val !== "") {
                       handleInputChange("servingSize", Number(val));
                   }
                }}
                min="0"
                step="0.1"
              />
              {servingSizeError && <p className="text-red-500 text-sm">{servingSizeError}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="servingUnit">{t('customFoodForm.unitLabel', 'Unit')}</Label>
              <Input
                id="servingUnit"
                value={formData.servingUnit}
                onChange={(e) => handleInputChange("servingUnit", e.target.value)}
                placeholder={t('customFoodForm.unitPlaceholder', 'g, ml, cup, etc.')}
              />
            </div>
          </div>
 
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="calories">{t('customFoodForm.caloriesLabel', 'Calories')}</Label>
              <Input
                id="calories"
                type="number"
                value={formData.calories}
                onChange={(e) => handleInputChange("calories", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="protein">{t('customFoodForm.proteinLabel', 'Protein (g)')}</Label>
              <Input
                id="protein"
                type="number"
                value={formData.protein}
                onChange={(e) => handleInputChange("protein", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="carbs">{t('customFoodForm.carbsLabel', 'Carbs (g)')}</Label>
              <Input
                id="carbs"
                type="number"
                value={formData.carbs}
                onChange={(e) => handleInputChange("carbs", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fat">{t('customFoodForm.fatLabel', 'Fat (g)')}</Label>
              <Input
                id="fat"
                type="number"
                value={formData.fat}
                onChange={(e) => handleInputChange("fat", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
          </div>
 
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="saturated_fat">{t('customFoodForm.saturatedFatLabel', 'Saturated Fat (g)')}</Label>
              <Input
                id="saturated_fat"
                type="number"
                value={formData.saturated_fat}
                onChange={(e) => handleInputChange("saturated_fat", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="polyunsaturated_fat">{t('customFoodForm.polyunsaturatedFatLabel', 'Polyunsaturated Fat (g)')}</Label>
              <Input
                id="polyunsaturated_fat"
                type="number"
                value={formData.polyunsaturated_fat}
                onChange={(e) => handleInputChange("polyunsaturated_fat", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monounsaturated_fat">{t('customFoodForm.monounsaturatedFatLabel', 'Monounsaturated Fat (g)')}</Label>
              <Input
                id="monounsaturated_fat"
                type="number"
                value={formData.monounsaturated_fat}
                onChange={(e) => handleInputChange("monounsaturated_fat", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trans_fat">{t('customFoodForm.transFatLabel', 'Trans Fat (g)')}</Label>
              <Input
                id="trans_fat"
                type="number"
                value={formData.trans_fat}
                onChange={(e) => handleInputChange("trans_fat", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
          </div>
 
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cholesterol">{t('customFoodForm.cholesterolLabel', 'Cholesterol (mg)')}</Label>
              <Input
                id="cholesterol"
                type="number"
                value={formData.cholesterol}
                onChange={(e) => handleInputChange("cholesterol", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sodium">{t('customFoodForm.sodiumLabel', 'Sodium (mg)')}</Label>
              <Input
                id="sodium"
                type="number"
                value={formData.sodium}
                onChange={(e) => handleInputChange("sodium", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="potassium">{t('customFoodForm.potassiumLabel', 'Potassium (mg)')}</Label>
              <Input
                id="potassium"
                type="number"
                value={formData.potassium}
                onChange={(e) => handleInputChange("potassium", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dietary_fiber">{t('customFoodForm.dietaryFiberLabel', 'Dietary Fiber (g)')}</Label>
              <Input
                id="dietary_fiber"
                type="number"
                value={formData.dietary_fiber}
                onChange={(e) => handleInputChange("dietary_fiber", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
          </div>
 
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sugars">{t('customFoodForm.sugarsLabel', 'Sugars (g)')}</Label>
              <Input
                id="sugars"
                type="number"
                value={formData.sugars}
                onChange={(e) => handleInputChange("sugars", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vitamin_a">{t('customFoodForm.vitaminALabel', 'Vitamin A (mcg)')}</Label>
              <Input
                id="vitamin_a"
                type="number"
                value={formData.vitamin_a}
                onChange={(e) => handleInputChange("vitamin_a", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vitamin_c">{t('customFoodForm.vitaminCLabel', 'Vitamin C (mg)')}</Label>
              <Input
                id="vitamin_c"
                type="number"
                value={formData.vitamin_c}
                onChange={(e) => handleInputChange("vitamin_c", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calcium">{t('customFoodForm.calciumLabel', 'Calcium (mg)')}</Label>
              <Input
                id="calcium"
                type="number"
                value={formData.calcium}
                onChange={(e) => handleInputChange("calcium", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
          </div>
 
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="iron">{t('customFoodForm.ironLabel', 'Iron (mg)')}</Label>
              <Input
                id="iron"
                type="number"
                value={formData.iron}
                onChange={(e) => handleInputChange("iron", Number(e.target.value))}
                min="0"
                step="0.1"
              />
            </div>
          </div>
 
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => debug(loggingLevel, "CustomFoodForm: Cancel button clicked.")}>
              {t('customFoodForm.cancelButton', 'Cancel')}
            </Button>
            <Button type="submit" className="bg-green-500 hover:bg-green-600">
              {t('customFoodForm.saveFoodButton', 'Save Food')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
 
export default CustomFoodForm;
