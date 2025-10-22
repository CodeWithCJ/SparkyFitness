import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Edit, Trash2, Eye, Filter } from 'lucide-react';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { toast } from '@/hooks/use-toast';
import { debug, info, warn, error } from '@/utils/logging';
import { Meal, MealFood } from '@/types/meal';
import { getMeals, deleteMeal, getMealById, MealFilter } from '@/services/mealService';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MealBuilder from './MealBuilder';

// This component is now a standalone library for managing meal templates.
// Interactions with the meal plan calendar are handled by the calendar itself.
const MealManagement: React.FC = () => {
  const { activeUserId } = useActiveUser();
  const { loggingLevel } = usePreferences();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<MealFilter>('all');
  const [editingMealId, setEditingMealId] = useState<string | undefined>(undefined);
  const [showMealBuilderDialog, setShowMealBuilderDialog] = useState(false);
  const [viewingMeal, setViewingMeal] = useState<Meal & { foods?: MealFood[] } | null>(null);

  const fetchMeals = useCallback(async () => {
    if (!activeUserId) return;
    try {
      const fetchedMeals = await getMeals(activeUserId, filter);
      setMeals(fetchedMeals || []); // Ensure it's always an array
    } catch (err) {
      error(loggingLevel, 'Failed to fetch meals:', err);
      toast({
        title: 'Error',
        description: 'Failed to load meals.',
        variant: 'destructive',
      });
    }
  }, [activeUserId, loggingLevel, filter]);

  useEffect(() => {
    fetchMeals();
  }, [fetchMeals]);

  const handleCreateNewMeal = () => {
    setEditingMealId(undefined);
    setShowMealBuilderDialog(true);
  };

  const handleEditMeal = (mealId: string) => {
    setEditingMealId(mealId);
    setShowMealBuilderDialog(true);
  };

  const handleDeleteMeal = async (mealId: string) => {
    if (!activeUserId || !window.confirm('Are you sure you want to delete this meal?')) return;
    try {
      await deleteMeal(activeUserId, mealId);
      toast({
        title: 'Success',
        description: 'Meal deleted successfully.',
      });
      fetchMeals();
    } catch (err) {
      error(loggingLevel, 'Failed to delete meal:', err);
      toast({
        title: 'Error',
        description: `Failed to delete meal: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    }
  };

  const handleMealSave = (meal: Meal) => {
    setShowMealBuilderDialog(false);
    fetchMeals();
    toast({
      title: 'Success',
      description: `Meal "${meal.name}" saved successfully.`,
    });
  };

  const handleMealCancel = () => {
    setShowMealBuilderDialog(false);
  };

  const handleViewDetails = async (meal: Meal) => {
    if (!activeUserId) return;
    try {
      // Fetch full meal details including foods
      const fullMeal = await getMealById(activeUserId, meal.id!);
      setViewingMeal(fullMeal);
    } catch (err) {
      error(loggingLevel, 'Failed to fetch meal details:', err);
      toast({
        title: 'Error',
        description: 'Could not load meal details.',
        variant: 'destructive',
      });
    }
  };

  const filteredMeals = meals.filter(meal =>
    meal.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">Manage Meals</CardTitle>
          <Button onClick={handleCreateNewMeal}>
            <Plus className="mr-2 h-4 w-4" /> Create New Meal
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <Input
              placeholder="Search meals..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" />
                <Select value={filter} onValueChange={(value: MealFilter) => setFilter(value)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="mine">My Meals</SelectItem>
                    <SelectItem value="family">Family</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="needs-review">Needs Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
          </div>

          {filteredMeals.length === 0 ? (
            <p className="text-center text-muted-foreground">No meals found. Create one!</p>
          ) : (
            <div className="space-y-4">
              {filteredMeals.map(meal => (
                <Card key={meal.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{meal.name}</h3>
                      <p className="text-sm text-muted-foreground">{meal.description || 'No description'}</p>
                      {meal.is_public && <span className="text-xs text-blue-500"> (Public)</span>}
                    </div>
                    <div className="flex space-x-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" onClick={() => handleEditMeal(meal.id!)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Edit Meal</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" onClick={() => handleDeleteMeal(meal.id!)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete Meal</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" onClick={() => handleViewDetails(meal)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>View Meal Details</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={showMealBuilderDialog} onOpenChange={setShowMealBuilderDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMealId ? 'Edit Meal' : 'Create New Meal'}</DialogTitle>
            <DialogDescription>
              {editingMealId ? 'Edit the details of your meal.' : 'Create a new meal by adding foods.'}
            </DialogDescription>
          </DialogHeader>
          <MealBuilder
            mealId={editingMealId}
            onSave={handleMealSave}
            onCancel={handleMealCancel}
          />
        </DialogContent>
      </Dialog>

      {/* View Meal Details Dialog */}
      <Dialog open={!!viewingMeal} onOpenChange={(isOpen) => !isOpen && setViewingMeal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewingMeal?.name}</DialogTitle>
            <DialogDescription>
              {viewingMeal?.description || 'No description provided.'}
            </DialogDescription>
          </DialogHeader>
          <div>
            <h4 className="font-semibold mb-2">Foods in this Meal:</h4>
            {viewingMeal?.foods && viewingMeal.foods.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {viewingMeal.foods.map((food, index) => (
                  <li key={index}>
                    {food.quantity} {food.unit} - {food.food_name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No foods have been added to this meal yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default MealManagement;