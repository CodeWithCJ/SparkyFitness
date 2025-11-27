import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { createMealFromDiary } from "@/services/mealService"; // Assuming this service function will be created
import { debug, info, error } from "@/utils/logging"; // Import logging utility
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences

interface ConvertToMealDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  mealType: string;
  onMealCreated: () => void;
}

const ConvertToMealDialog: React.FC<ConvertToMealDialogProps> = ({
  isOpen,
  onClose,
  selectedDate,
  mealType,
  onMealCreated,
}) => {
  const { t } = useTranslation();
  const { loggingLevel } = usePreferences();
  const [mealName, setMealName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Set a default meal name based on the meal type and date
      const defaultName = `${t(`common.${mealType}`, mealType)} - ${selectedDate}`;
      setMealName(defaultName);
      setDescription("");
      setIsPublic(false);
      debug(loggingLevel, "ConvertToMealDialog: Dialog opened with mealType:", mealType, "and selectedDate:", selectedDate);
    }
  }, [isOpen, mealType, selectedDate, t, loggingLevel]);

  const handleSubmit = useCallback(async () => {
    setIsLoading(true);
    debug(loggingLevel, "ConvertToMealDialog: Submitting new meal with data:", { mealName, description, isPublic, selectedDate, mealType });
    try {
      await createMealFromDiary(selectedDate, mealType, mealName, description, isPublic);
      toast({
        title: t("mealCreation.success", "Success"),
        description: t("mealCreation.mealCreatedSuccessfully", "Meal created successfully from diary entries."),
      });
      info(loggingLevel, "ConvertToMealDialog: Meal created successfully.");
      onMealCreated();
      onClose();
    } catch (err: any) {
      error(loggingLevel, "ConvertToMealDialog: Error creating meal:", err);
      toast({
        title: t("mealCreation.error", "Error"),
        description: err.response?.data?.error || t("mealCreation.failedToCreateMeal", "Failed to create meal from diary entries."),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [mealName, description, isPublic, selectedDate, mealType, onMealCreated, onClose, t, loggingLevel]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("mealCreation.convertToMeal", "Create Meal from Diary")}</DialogTitle>
          <DialogDescription>
            {t("mealCreation.enterDetails", "Enter details for your new meal template.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="mealName" className="text-right">
              {t("mealCreation.mealName", "Meal Name")}
            </Label>
            <Input
              id="mealName"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              className="col-span-3"
              disabled={isLoading}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">
              {t("mealCreation.description", "Description")}
            </Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3"
              disabled={isLoading}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="isPublic" className="text-right">
              {t("mealCreation.makePublic", "Make Public")}
            </Label>
            <Switch
              id="isPublic"
              checked={isPublic}
              onCheckedChange={setIsPublic}
              className="col-span-3"
              disabled={isLoading}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !mealName}>
            {isLoading ? t("common.creating", "Creating...") : t("common.create", "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertToMealDialog;