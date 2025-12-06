
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Plus, Minus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { toast } from "@/hooks/use-toast";
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import {
  createFoodInDatabase,
  addFoodEntry,
  FoodSuggestion,
} from '@/services/enhancedFoodConfirmationService';


interface EnhancedFoodConfirmationProps {
  suggestions: FoodSuggestion[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (confirmedFoods: FoodSuggestion[]) => void;
  contextDate?: string;
}

const EnhancedFoodConfirmation = ({ 
  suggestions, 
  isOpen, 
  onClose, 
  onConfirm,
  contextDate
}: EnhancedFoodConfirmationProps) => {
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { formatDateInUserTimezone, energyUnit, convertEnergy } = usePreferences(); // Use formatDateInUserTimezone, energyUnit, convertEnergy
  
  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    // This component does not import useTranslation, so we'll hardcode or pass t() from parent if it were needed for translation
    return unit === 'kcal' ? 'kcal' : 'kJ';
  };
  const [selectedFoods, setSelectedFoods] = useState<boolean[]>(
    new Array(suggestions.length).fill(true)
  );
  const [editedSuggestions, setEditedSuggestions] = useState<FoodSuggestion[]>(suggestions);
  const [targetDate, setTargetDate] = useState(contextDate || formatDateInUserTimezone(new Date(), 'yyyy-MM-dd')); // Use formatDateInUserTimezone
  const [globalMealType, setGlobalMealType] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Determine if we need to ask for meal type
  const needsMealTypeSelection = suggestions.some(s => !s.meal_type) || 
    new Set(suggestions.map(s => s.meal_type)).size > 1;

  const handleFoodToggle = (index: number, checked: boolean) => {
    const newSelected = [...selectedFoods];
    newSelected[index] = checked;
    setSelectedFoods(newSelected);
  };

  const handleQuantityChange = (index: number, newQuantity: number) => {
    const newSuggestions = [...editedSuggestions];
    const originalQuantity = newSuggestions[index].quantity;
    const multiplier = newQuantity / originalQuantity;
    
    newSuggestions[index] = {
      ...newSuggestions[index],
      quantity: newQuantity,
      calories: Math.round(newSuggestions[index].calories * multiplier), // This calculation is in kcal
      protein: Math.round(newSuggestions[index].protein * multiplier * 10) / 10,
      carbs: Math.round(newSuggestions[index].carbs * multiplier * 10) / 10,
      fat: Math.round(newSuggestions[index].fat * multiplier * 10) / 10,
    };
    
    setEditedSuggestions(newSuggestions);
  };

  const handleMealTypeChange = (index: number, mealType: string) => {
    const newSuggestions = [...editedSuggestions];
    newSuggestions[index].meal_type = mealType;
    setEditedSuggestions(newSuggestions);
  };

  const applyGlobalMealType = () => {
    if (!globalMealType) return;
    
    const newSuggestions = editedSuggestions.map(suggestion => ({
      ...suggestion,
      meal_type: globalMealType
    }));
    setEditedSuggestions(newSuggestions);
  };

  const handleConfirm = async () => {
    if (!user || !activeUserId) {
      toast({
        title: "Authentication required",
        description: "Please sign in to add foods",
        variant: "destructive",
      });
      return;
    }

    // Validate that selected foods have meal types
    const selectedSuggestionsWithTypes = editedSuggestions
      .filter((_, index) => selectedFoods[index])
      .filter(suggestion => suggestion.meal_type);

    if (selectedSuggestionsWithTypes.length === 0) {
      toast({
        title: "Please select foods and meal types",
        description: "Select at least one food and specify its meal type",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Process each selected food
      for (const suggestion of selectedSuggestionsWithTypes) {
        // suggestion.calories is already in kcal
        const foodId = await createFoodInDatabase(suggestion, activeUserId);
        await addFoodEntry(
          suggestion,
          foodId,
          activeUserId,
          formatDateInUserTimezone(new Date(targetDate), 'yyyy-MM-dd')
        );
      }

      toast({
        title: "Foods added successfully!",
        description: `Added ${selectedSuggestionsWithTypes.length} food(s) to your diary for ${targetDate}`,
      });

      onConfirm(selectedSuggestionsWithTypes);
      onClose();
    } catch (error) {
      console.error('Error processing foods:', error);
      toast({
        title: "Error adding foods",
        description: "Failed to add some foods to your diary. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };


  const totalSelected = selectedFoods.filter(Boolean).length;
      const selectedSuggestions = editedSuggestions.filter((_, index) => selectedFoods[index]);
      const totalNutrition = selectedSuggestions.reduce(
        (total, suggestion) => ({
          calories: total.calories + suggestion.calories, // These are in kcal
          protein: total.protein + suggestion.protein,
          carbs: total.carbs + suggestion.carbs,
          fat: total.fat + suggestion.fat,
        }),    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Confirm Food Entries ({totalSelected} selected)
          </DialogTitle>
          <DialogDescription>
            Review and confirm the food entries before adding them to your diary.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date and Global Meal Type Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <Label htmlFor="date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Date
              </Label>
              <Input
                id="date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
            
            {needsMealTypeSelection && (
              <div>
                <Label htmlFor="global-meal" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Apply to all
                </Label>
                <div className="flex gap-2">
                  <Select value={globalMealType} onValueChange={setGlobalMealType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select meal type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="breakfast">Breakfast</SelectItem>
                      <SelectItem value="lunch">Lunch</SelectItem>
                      <SelectItem value="dinner">Dinner</SelectItem>
                      <SelectItem value="snacks">Snacks</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={applyGlobalMealType} 
                    variant="outline" 
                    size="sm"
                    disabled={!globalMealType}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Food List */}
          <div className="space-y-3">
            {editedSuggestions.map((suggestion, index) => (
              <Card key={index} className={`${selectedFoods[index] ? 'ring-2 ring-primary' : 'opacity-60'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedFoods[index]}
                      onCheckedChange={(checked) => handleFoodToggle(index, checked as boolean)}
                      className="mt-1"
                    />
                    
                    <div className="flex-1 space-y-3">
                      <div>
                        <h3 className="font-medium">{suggestion.name}</h3>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <Badge variant="outline">{Math.round(convertEnergy(suggestion.calories, 'kcal', energyUnit))} {getEnergyUnitString(energyUnit)}</Badge>
                          <Badge variant="outline">{suggestion.protein}g protein</Badge>
                          <Badge variant="outline">{suggestion.carbs}g carbs</Badge>
                          <Badge variant="outline">{suggestion.fat}g fat</Badge>
                        </div>
                        {(suggestion.description || suggestion.preparation_time || suggestion.servings) && (
                          <div className="text-xs text-gray-500 mt-2">
                            {suggestion.description && <p>{suggestion.description}</p>}
                            {suggestion.preparation_time && <p>Preparation Time: {suggestion.preparation_time}</p>}
                            {suggestion.servings && <p>Servings: {suggestion.servings}</p>}
                          </div>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Quantity</Label>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleQuantityChange(index, Math.max(0.1, suggestion.quantity - 0.5))}
                              disabled={!selectedFoods[index]}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              step="0.1"
                              value={suggestion.quantity}
                              onChange={(e) => handleQuantityChange(index, parseFloat(e.target.value) || 0)}
                              className="h-8 text-center"
                              disabled={!selectedFoods[index]}
                            />
                            <span className="text-sm text-muted-foreground min-w-8">{suggestion.unit}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleQuantityChange(index, suggestion.quantity + 0.5)}
                              disabled={!selectedFoods[index]}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        
                        <div>
                          <Label className="text-xs">Meal Type</Label>
                          <Select
                            value={suggestion.meal_type}
                            onValueChange={(value) => handleMealTypeChange(index, value)}
                            disabled={!selectedFoods[index]}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Select meal" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="breakfast">Breakfast</SelectItem>
                              <SelectItem value="lunch">Lunch</SelectItem>
                              <SelectItem value="dinner">Dinner</SelectItem>
                              <SelectItem value="snacks">Snacks</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Summary */}
          {totalSelected > 0 && (
            <div className="p-4 bg-primary/5 rounded-lg">
              <h4 className="font-medium mb-2">Total Nutrition (Selected Items)</h4>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <div className="font-bold">{Math.round(convertEnergy(totalNutrition.calories, 'kcal', energyUnit))}</div>
                  <div className="text-muted-foreground">{getEnergyUnitString(energyUnit)}</div>
                </div>
                <div className="text-center">
                  <div className="font-bold">{totalNutrition.protein.toFixed(1)}g</div>
                  <div className="text-muted-foreground">protein</div>
                </div>
                <div className="text-center">
                  <div className="font-bold">{totalNutrition.carbs.toFixed(1)}g</div>
                  <div className="text-muted-foreground">carbs</div>
                </div>
                <div className="text-center">
                  <div className="font-bold">{totalNutrition.fat.toFixed(1)}g</div>
                  <div className="text-muted-foreground">fat</div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleConfirm}
              className="flex-1"
              disabled={totalSelected === 0 || isLoading}
            >
              {isLoading ? 'Adding...' : `Confirm & Add ${totalSelected} Food(s)`}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EnhancedFoodConfirmation;
