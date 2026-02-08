import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { toast } from '@/hooks/use-toast';
import { error } from '@/utils/logging';
import { Food, FoodVariant, FoodSearchResult } from '@/types/food'; // Import FoodSearchResult
import { searchFoods } from '@/services/foodService';
import FoodUnitSelector from '@/components/FoodUnitSelector';

interface FoodPlanSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFoodSelect: (food: Food, quantity: number, unit: string, selectedVariant: FoodVariant) => void;
}

const FoodPlanSelector: React.FC<FoodPlanSelectorProps> = ({ open, onOpenChange, onFoodSelect }) => {
  const { activeUserId } = useActiveUser();
  const { loggingLevel, foodDisplayLimit } = usePreferences();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Food[]>([]);
  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  const [topFoods, setTopFoods] = useState<Food[]>([]);
  const [isFoodUnitSelectorOpen, setIsFoodUnitSelectorOpen] = useState(false);
  const [selectedFoodForUnitSelection, setSelectedFoodForUnitSelection] = useState<Food | null>(null);

  useEffect(() => {
    if (open) {
      // When the dialog opens, clear search term and load recent/top foods
      setSearchTerm('');
      handleSearchFoods();
    }
  }, [open]); // Depend on 'open' prop

  const handleSearchFoods = useCallback(async () => {
    setSearchResults([]); // Clear previous search results
    setRecentFoods([]); // Clear previous recent foods
    setTopFoods([]); // Clear previous top foods

    try {
      if (!searchTerm.trim()) {
        // If search term is empty, fetch recent and top foods
        const data = await searchFoods(activeUserId!, '', activeUserId!, false, true, true, foodDisplayLimit) as FoodSearchResult;
        setRecentFoods(data.recentFoods || []);
        setTopFoods(data.topFoods || []);
      } else {
        // Otherwise, perform a regular search
        const data = await searchFoods(activeUserId!, searchTerm, activeUserId!, false, true, true, foodDisplayLimit) as FoodSearchResult;
        setSearchResults(data.searchResults || []);
      }
    } catch (err) {
      error(loggingLevel, 'Error searching foods:', err);
      toast({
        title: 'Error',
        description: 'Failed to search foods.',
        variant: 'destructive',
      });
    }
  }, [searchTerm, activeUserId, loggingLevel, foodDisplayLimit]);

  const handleAddFood = useCallback((food: Food) => {
    setSelectedFoodForUnitSelection(food);
    setIsFoodUnitSelectorOpen(true);
  }, []);

  const handleFoodUnitSelected = useCallback((food: Food, quantity: number, unit: string, selectedVariant: FoodVariant) => {
    onFoodSelect(food, quantity, unit, selectedVariant);
    setIsFoodUnitSelectorOpen(false);
    setSelectedFoodForUnitSelection(null);
    setSearchTerm('');
    setSearchResults([]);
    onOpenChange(false); // Close the main dialog after selection
  }, [onFoodSelect, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Food to Meal Plan</DialogTitle>
          <DialogDescription>
            Search for a food item and specify its quantity and unit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex space-x-2">
            <Input
              placeholder="Search for food..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSearchFoods();
                }
              }}
              className="flex-1"
            />
            <Button onClick={handleSearchFoods}>
              <Search className="h-4 w-4 mr-2" /> Search
            </Button>
          </div>

          {searchTerm.trim() === '' && (recentFoods.length > 0 || topFoods.length > 0) ? (
            <>
              {recentFoods.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-md font-semibold">Recent Foods</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                    {recentFoods.map(food => (
                      <div key={food.id} className="flex items-center justify-between p-1 hover:bg-accent rounded-sm">
                        <span>{food.name} {food.brand ? `(${food.brand})` : ''}</span>
                        <Button variant="outline" size="sm" onClick={() => handleAddFood(food)}>
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topFoods.length > 0 && (
                <div className="space-y-2 mt-4">
                  <h4 className="text-md font-semibold">Top Foods</h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                    {topFoods.map(food => (
                      <div key={food.id} className="flex items-center justify-between p-1 hover:bg-accent rounded-sm">
                        <span>{food.name} {food.brand ? `(${food.brand})` : ''}</span>
                        <Button variant="outline" size="sm" onClick={() => handleAddFood(food)}>
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            searchResults.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                {searchResults.map(food => (
                  <div key={food.id} className="flex items-center justify-between p-1 hover:bg-accent rounded-sm">
                    <span>{food.name} {food.brand ? `(${food.brand})` : ''}</span>
                    <Button variant="outline" size="sm" onClick={() => handleAddFood(food)}>
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            )
          )}

          {selectedFoodForUnitSelection && (
            <FoodUnitSelector
              food={selectedFoodForUnitSelection}
              open={isFoodUnitSelectorOpen}
              onOpenChange={setIsFoodUnitSelectorOpen}
              onSelect={handleFoodUnitSelected}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FoodPlanSelector;