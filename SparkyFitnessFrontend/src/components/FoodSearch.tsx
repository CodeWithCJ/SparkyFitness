
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, warn, error } from '@/utils/logging';

// This component is deprecated and replaced by EnhancedFoodSearch.tsx
// Keeping it for reference or if there's a specific need for a simpler version.

interface Food {
  id: string;
  name: string;
  brand?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
}

interface FoodSearchProps {
  onFoodSelect: (food: Food) => void;
}

const FoodSearch = ({ onFoodSelect }: FoodSearchProps) => {
  const { loggingLevel, energyUnit, convertEnergy, getEnergyUnitString } = usePreferences();
  debug(loggingLevel, "FoodSearch: Component rendered.");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  // Mock data for demonstration - replace with actual OpenFoodFacts API
  const mockFoods: Food[] = [
    {
      id: "1",
      name: "Banana",
      calories: 89,
      protein: 1.1,
      carbs: 22.8,
      fat: 0.3,
      fiber: 2.6,
      sugar: 12.2
    },
    {
      id: "2",
      name: "Chicken Breast",
      brand: "Generic",
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
      fiber: 0
    },
    {
      id: "3",
      name: "Brown Rice",
      calories: 216,
      protein: 5,
      carbs: 45,
      fat: 1.8,
      fiber: 3.5
    },
    {
      id: "4",
      name: "Greek Yogurt",
      brand: "Chobani",
      calories: 100,
      protein: 17,
      carbs: 6,
      fat: 0,
      sugar: 4
    }
  ];

  const { data: foods = [], isLoading } = useQuery({
    queryKey: ['foods', debouncedSearchTerm],
    queryFn: async () => {
      debug(loggingLevel, "FoodSearch: Performing search for:", debouncedSearchTerm);
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!debouncedSearchTerm) {
        debug(loggingLevel, "FoodSearch: Search term is empty, returning empty array.");
        return [];
      }

      const results = mockFoods.filter(food =>
        food.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        (food.brand && food.brand.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
      );
      info(loggingLevel, `FoodSearch: Found ${results.length} results for "${debouncedSearchTerm}".`);
      return results;
    },
    enabled: debouncedSearchTerm.length > 0
  });

  const handleSearch = () => {
    debug(loggingLevel, "FoodSearch: Handling search button click.");
    setDebouncedSearchTerm(searchTerm);
  };

  return (
    <div className="space-y-4">
      <div className="flex space-x-2">
        <Input
          placeholder="Search for foods..."
          value={searchTerm}
          onChange={(e) => {
            debug(loggingLevel, "FoodSearch: Search term input changed:", e.target.value);
            setSearchTerm(e.target.value);
          }}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              debug(loggingLevel, "FoodSearch: Enter key pressed in search input.");
              handleSearch();
            }
          }}
          className="flex-1"
        />
        <Button onClick={handleSearch} disabled={!searchTerm.trim()}>
          <Search className="w-4 h-4" />
        </Button>
      </div>

      {isLoading && (
        <div className="text-center py-8 text-gray-500">
          Searching foods...
        </div>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {foods.map((food) => (
          <Card key={food.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <h3 className="font-semibold">{food.name}</h3>
                    {food.brand && (
                      <Badge variant="secondary" className="text-xs">
                        {food.brand}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-sm text-gray-600">
                    <div>
                      <div className="font-medium text-gray-900">{Math.round(convertEnergy(food.calories, 'kcal', energyUnit))}</div>
                      <div>{getEnergyUnitString(energyUnit)}</div>
                    </div>
                    <div>
                      <div className="font-medium text-blue-600">{food.protein}g</div>
                      <div>protein</div>
                    </div>
                    <div>
                      <div className="font-medium text-orange-600">{food.carbs}g</div>
                      <div>carbs</div>
                    </div>
                    <div>
                      <div className="font-medium text-yellow-600">{food.fat}g</div>
                      <div>fat</div>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    debug(loggingLevel, "FoodSearch: Add button clicked for food:", food.name);
                    onFoodSelect(food);
                  }}
                  size="sm"
                  className="ml-4"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {debouncedSearchTerm && foods.length === 0 && !isLoading && (
        <div className="text-center py-8 text-gray-500">
          No foods found. Try a different search term.
        </div>
      )}
    </div>
  );
};

export default FoodSearch;
