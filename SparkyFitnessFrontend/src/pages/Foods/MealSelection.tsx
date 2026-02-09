import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { getMeals } from '@/services/mealService';
import type { Meal } from '@/types/meal';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePreferences } from '@/contexts/PreferencesContext';
import { error } from '@/utils/logging';

interface MealSelectionProps {
  onMealSelect: (meal: Meal) => void;
}

const MealSelection: React.FC<MealSelectionProps> = ({ onMealSelect }) => {
  const { activeUserId } = useActiveUser();
  const { loggingLevel, foodDisplayLimit } = usePreferences(); // Get foodDisplayLimit
  const [meals, setMeals] = useState<Meal[]>([]);
  const [recentMeals, setRecentMeals] = useState<Meal[]>([]); // New state for recent meals
  const [topMeals, setTopMeals] = useState<Meal[]>([]); // New state for top meals
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchMeals = useCallback(async () => {
    if (!activeUserId) return;
    setLoading(true);
    try {
      if (!searchTerm.trim()) {
        // If search term is empty, fetch recent and top meals
        const fetchedRecentMeals = await getMeals(activeUserId, false, true, false, foodDisplayLimit);
        setRecentMeals(fetchedRecentMeals || []);
        const fetchedTopMeals = await getMeals(activeUserId, false, false, true, foodDisplayLimit);
        setTopMeals(fetchedTopMeals || []);
        setMeals([]); // Clear meals from previous search
      } else {
        // Otherwise, perform a regular search
        const fetchedMeals = await getMeals(activeUserId, false, false, false, null); // Fetch all meals for search
        setMeals(fetchedMeals || []);
        setRecentMeals([]); // Clear recent meals
        setTopMeals([]); // Clear top meals
      }
    } catch (err) {
      error(loggingLevel, 'Failed to fetch meals for selection:', err);
      toast({
        title: 'Error',
        description: 'Could not load your meals.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [activeUserId, loggingLevel, searchTerm, foodDisplayLimit]);

  useEffect(() => {
    fetchMeals();
  }, [fetchMeals]);

  const filteredMeals = meals.filter(meal =>
    meal.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search your meals..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            fetchMeals();
          }
        }}
      />
      <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
        {loading ? (
          <p>Loading meals...</p>
        ) : searchTerm.trim() === '' && (recentMeals.length > 0 || topMeals.length > 0) ? (
          <>
            {recentMeals.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-md font-semibold">Recent Meals</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                  {recentMeals.map(meal => (
                    <Card
                      key={meal.id}
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => onMealSelect(meal)}
                    >
                      <CardContent className="p-3">
                        <p className="font-semibold">{meal.name}</p>
                        {meal.description && (
                          <p className="text-sm text-muted-foreground">{meal.description}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {topMeals.length > 0 && (
              <div className="space-y-2 mt-4">
                <h4 className="text-md font-semibold">Top Meals</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                  {topMeals.map(meal => (
                    <Card
                      key={meal.id}
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => onMealSelect(meal)}
                    >
                      <CardContent className="p-3">
                        <p className="font-semibold">{meal.name}</p>
                        {meal.description && (
                          <p className="text-sm text-muted-foreground">{meal.description}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : filteredMeals.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">
            No meals found. Go to the 'Meal Management' page to create some!
          </p>
        ) : (
          filteredMeals.map(meal => (
            <Card
              key={meal.id}
              className="cursor-pointer hover:bg-accent"
              onClick={() => onMealSelect(meal)}
            >
              <CardContent className="p-3">
                <p className="font-semibold">{meal.name}</p>
                {meal.description && (
                  <p className="text-sm text-muted-foreground">{meal.description}</p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default MealSelection;
