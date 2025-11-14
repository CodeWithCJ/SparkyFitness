import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import EnhancedFoodSearch from "./EnhancedFoodSearch";
import { Food } from '@/types/food';
import { Meal } from '@/types/meal';

interface FoodSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFoodSelect: (item: Food | Meal, type: 'food' | 'meal') => void;
  title?: string;
  description?: string;
  hideDatabaseTab?: boolean;
  hideMealTab?: boolean;
  mealType?: string;
}

const FoodSearchDialog = ({
  open,
  onOpenChange,
  onFoodSelect,
  title = "Search and Add Food",
  description = "Search for foods to add to your database.",
  hideDatabaseTab = false,
  hideMealTab = false,
  mealType = undefined,
}: FoodSearchDialogProps) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("foodSearchDialog.title", title)}</DialogTitle>
          <DialogDescription>
            {t("foodSearchDialog.description", description)}
          </DialogDescription>
        </DialogHeader>
        <EnhancedFoodSearch onFoodSelect={onFoodSelect} hideDatabaseTab={hideDatabaseTab} hideMealTab={hideMealTab} mealType={mealType} />
      </DialogContent>
    </Dialog>
  );
};

export default FoodSearchDialog;