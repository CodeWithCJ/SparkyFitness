import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { updateExercise, Exercise } from "@/services/exerciseService";
import { debug, error } from "@/utils/logging";
import { usePreferences } from "@/contexts/PreferencesContext";

interface EditExerciseDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseToEdit: Exercise | null;
  onSaveSuccess: () => void;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (value: number, fromUnit: 'kcal' | 'kJ', toUnit: 'kcal' | 'kJ') => number;
  getEnergyUnitString: (unit: 'kcal' | 'kJ') => string;
}

const EditExerciseDatabaseDialog: React.FC<EditExerciseDatabaseDialogProps> = ({
  open,
  onOpenChange,
  exerciseToEdit,
  onSaveSuccess,
  energyUnit,
  convertEnergy,
  getEnergyUnitString,
}) => {
  const { t } = useTranslation();
  const { loggingLevel } = usePreferences();

  const [editExerciseName, setEditExerciseName] = useState("");
  const [editExerciseCategory, setEditExerciseCategory] = useState("general");
  const [editExerciseCalories, setEditExerciseCalories] = useState(300);
  const [editExerciseDescription, setEditExerciseDescription] = useState("");
  const [editExerciseLevel, setEditExerciseLevel] = useState("");
  const [editExerciseForce, setEditExerciseForce] = useState("");
  const [editExerciseMechanic, setEditExerciseMechanic] = useState("");
  const [editExerciseEquipment, setEditExerciseEquipment] = useState<string[]>([]);
  const [editExercisePrimaryMuscles, setEditExercisePrimaryMuscles] = useState<string[]>([]);
  const [editExerciseSecondaryMuscles, setEditExerciseSecondaryMuscles] = useState<string[]>([]);
  const [editExerciseInstructions, setEditExerciseInstructions] = useState<string[]>([]);
  const [editExerciseImages, setEditExerciseImages] = useState<string[]>([]);
  const [newExerciseImageFiles, setNewExerciseImageFiles] = useState<File[]>([]);
  const [newExerciseImageUrls, setNewExerciseImageUrls] = useState<string[]>([]);
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);

  useEffect(() => {
    if (exerciseToEdit) {
      setEditExerciseName(exerciseToEdit.name);
      setEditExerciseCategory(exerciseToEdit.category);
      setEditExerciseCalories(exerciseToEdit.calories_per_hour); // Assumed to be in kcal
      setEditExerciseDescription(exerciseToEdit.description || "");
      setEditExerciseLevel(exerciseToEdit.level?.toLowerCase() || "");
      setEditExerciseForce(exerciseToEdit.force?.toLowerCase() || "");
      setEditExerciseMechanic(exerciseToEdit.mechanic?.toLowerCase() || "");
      setEditExerciseEquipment(Array.isArray(exerciseToEdit.equipment) ? exerciseToEdit.equipment : []);
      setEditExercisePrimaryMuscles(Array.isArray(exerciseToEdit.primary_muscles) ? exerciseToEdit.primary_muscles : []);
      setEditExerciseSecondaryMuscles(Array.isArray(exerciseToEdit.secondary_muscles) ? exerciseToEdit.secondary_muscles : []);
      setEditExerciseInstructions(Array.isArray(exerciseToEdit.instructions) ? exerciseToEdit.instructions : []);
      setEditExerciseImages(Array.isArray(exerciseToEdit.images) ? exerciseToEdit.images : []);
      setNewExerciseImageFiles([]);
      setNewExerciseImageUrls([]);
    }
  }, [exerciseToEdit]);

  const handleSaveExerciseDatabaseEdit = useCallback(async () => {
    if (!exerciseToEdit) return;

    try {
      const formData = new FormData();
      const updatedExerciseData: Partial<Exercise> = {
        name: editExerciseName,
        category: editExerciseCategory,
        calories_per_hour: convertEnergy(editExerciseCalories, energyUnit, 'kcal'), // Convert back to kcal for saving
        description: editExerciseDescription,
        level: editExerciseLevel,
        force: editExerciseForce,
        mechanic: editExerciseMechanic,
        equipment: editExerciseEquipment,
        primary_muscles: editExercisePrimaryMuscles,
        secondary_muscles: editExerciseSecondaryMuscles,
        instructions: editExerciseInstructions,
        images: editExerciseImages,
      };

      formData.append('exerciseData', JSON.stringify(updatedExerciseData));
      newExerciseImageFiles.forEach((file) => {
        formData.append('images', file);
      });

      await updateExercise(exerciseToEdit.id, formData);
      toast({
        title: t("common.success", "Success"),
        description: t("exerciseCard.exerciseUpdated", "Exercise updated successfully in database"),
      });
      onOpenChange(false);
      onSaveSuccess();
    } catch (err) {
      error(loggingLevel, "Error updating exercise in database:", err);
      toast({
        title: t("common.error", "Error"),
        description: t("exerciseCard.failedToUpdateExercise", "Failed to update exercise in database"),
        variant: "destructive",
      });
    }
  }, [
    exerciseToEdit,
    editExerciseName,
    editExerciseCategory,
    editExerciseCalories,
    editExerciseDescription,
    editExerciseLevel,
    editExerciseForce,
    editExerciseMechanic,
    editExerciseEquipment,
    editExercisePrimaryMuscles,
    editExerciseSecondaryMuscles,
    editExerciseInstructions,
    editExerciseImages,
    newExerciseImageFiles,
    onOpenChange,
    onSaveSuccess,
    loggingLevel,
    t,
  ]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setNewExerciseImageFiles((prevImages) => [...prevImages, ...filesArray]);
      filesArray.forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setNewExerciseImageUrls((prevUrls) => [...prevUrls, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setNewExerciseImageFiles((prevImages) => prevImages.filter((_, index) => index !== indexToRemove));
    setNewExerciseImageUrls((prevUrls) => prevUrls.filter((_, index) => index !== indexToRemove));
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedImageIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (draggedImageIndex === null || draggedImageIndex === index) {
      return;
    }

    const reorderedImages = [...editExerciseImages];
    const reorderedNewImages = [...newExerciseImageFiles];
    const reorderedNewImageUrls = [...newExerciseImageUrls];

    const allImages = [...reorderedImages, ...reorderedNewImageUrls];
    const allFiles = [...reorderedNewImages];

    const targetIndex = index; // Target index in the combined array

    if (draggedImageIndex < reorderedImages.length) { // Dragging an existing image
      const [draggedItem] = reorderedImages.splice(draggedImageIndex, 1);
      allImages.splice(targetIndex, 0, draggedItem);
    } else { // Dragging a new image
      const draggedNewImageIndex = draggedImageIndex - reorderedImages.length;
      const [draggedFile] = reorderedNewImages.splice(draggedNewImageIndex, 1);
      const [draggedUrl] = reorderedNewImageUrls.splice(draggedNewImageIndex, 1);
      
      allImages.splice(targetIndex, 0, draggedUrl);
      allFiles.splice(targetIndex, 0, draggedFile);
    }

    // Reconstruct the separate arrays
    setEditExerciseImages(allImages.slice(0, reorderedImages.length));
    setNewExerciseImageUrls(allImages.slice(reorderedImages.length));
    setNewExerciseImageFiles(allFiles); // This might need more complex re-mapping if files are reordered across existing/new boundary

    setDraggedImageIndex(null);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[625px] overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t("exerciseCard.editExerciseInDatabase", "Edit Exercise in Database")}</DialogTitle>
          <DialogDescription>
            {t("exerciseCard.editExerciseInDatabaseDescription", "Edit the details of the selected exercise in the database.")}
          </DialogDescription>
        </DialogHeader>
        {exerciseToEdit && (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-db-name" className="text-right">
                {t("exerciseCard.name", "Name")}
              </Label>
              <Input
                id="edit-db-name"
                value={editExerciseName}
                onChange={(e) => setEditExerciseName(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-db-category" className="text-right">
                {t("exerciseCard.category", "Category")}
              </Label>
              <Select onValueChange={setEditExerciseCategory} defaultValue={editExerciseCategory}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={t("exerciseCard.selectCategory", "Select a category")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">{t("exerciseCard.categoryGeneral", "General")}</SelectItem>
                  <SelectItem value="strength">{t("exerciseCard.categoryStrength", "Strength")}</SelectItem>
                  <SelectItem value="cardio">{t("exerciseCard.categoryCardio", "Cardio")}</SelectItem>
                  <SelectItem value="yoga">{t("exerciseCard.categoryYoga", "Yoga")}</SelectItem>
                  <SelectItem value="powerlifting">{t("exerciseCard.categoryPowerlifting", "Powerlifting")}</SelectItem>
                  <SelectItem value="olympic weightlifting">{t("exerciseCard.categoryOlympicWeightlifting", "Olympic Weightlifting")}</SelectItem>
                  <SelectItem value="strongman">{t("exerciseCard.categoryStrongman", "Strongman")}</SelectItem>
                  <SelectItem value="plyometrics">{t("exerciseCard.categoryPlyometrics", "Plyometrics")}</SelectItem>
                  <SelectItem value="stretching">{t("exerciseCard.categoryStretching", "Stretching")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-db-calories" className="text-right">
                {t("exerciseCard.caloriesPerHour", `Calories/Hour (${getEnergyUnitString(energyUnit)})`)}
              </Label>
              <Input
                id="edit-db-calories"
                type="number"
                value={Math.round(convertEnergy(editExerciseCalories, 'kcal', energyUnit)).toString()}
                onChange={(e) => setEditExerciseCalories(Number(convertEnergy(Number(e.target.value), energyUnit, 'kcal')))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-db-level" className="text-right">
                {t("exerciseCard.level", "Level")}
              </Label>
              <Select onValueChange={setEditExerciseLevel} defaultValue={editExerciseLevel}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={t("exerciseCard.selectLevel", "Select level")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">{t("exerciseCard.levelBeginner", "Beginner")}</SelectItem>
                  <SelectItem value="intermediate">{t("exerciseCard.levelIntermediate", "Intermediate")}</SelectItem>
                  <SelectItem value="expert">{t("exerciseCard.levelExpert", "Expert")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-db-force" className="text-right">
                {t("exerciseCard.force", "Force")}
              </Label>
              <Select onValueChange={setEditExerciseForce} defaultValue={editExerciseForce}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={t("exerciseCard.selectForce", "Select force")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pull">{t("exerciseCard.forcePull", "Pull")}</SelectItem>
                  <SelectItem value="push">{t("exerciseCard.forcePush", "Push")}</SelectItem>
                  <SelectItem value="static">{t("exerciseCard.forceStatic", "Static")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-db-mechanic" className="text-right">
                {t("exerciseCard.mechanic", "Mechanic")}
              </Label>
              <Select onValueChange={setEditExerciseMechanic} defaultValue={editExerciseMechanic}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={t("exerciseCard.selectMechanic", "Select mechanic")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="isolation">{t("exerciseCard.mechanicIsolation", "Isolation")}</SelectItem>
                  <SelectItem value="compound">{t("exerciseCard.mechanicCompound", "Compound")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-db-equipment" className="text-right mt-1">
                {t("exerciseCard.equipment", "Equipment (comma-separated)")}
              </Label>
              <Input
                id="edit-db-equipment"
                value={editExerciseEquipment.join(', ')}
                onChange={(e) => setEditExerciseEquipment(e.target.value.split(',').map(s => s.trim()))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-db-primary-muscles" className="text-right mt-1">
                {t("exerciseCard.primaryMuscles", "Primary Muscles (comma-separated)")}
              </Label>
              <Input
                id="edit-db-primary-muscles"
                value={editExercisePrimaryMuscles.join(', ')}
                onChange={(e) => setEditExercisePrimaryMuscles(e.target.value.split(',').map(s => s.trim()))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-db-secondary-muscles" className="text-right mt-1">
                {t("exerciseCard.secondaryMuscles", "Secondary Muscles (comma-separated)")}
              </Label>
              <Input
                id="edit-db-secondary-muscles"
                value={editExerciseSecondaryMuscles.join(', ')}
                onChange={(e) => setEditExerciseSecondaryMuscles(e.target.value.split(',').map(s => s.trim()))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-db-instructions" className="text-right mt-1">
                {t("exerciseCard.instructions", "Instructions (one per line)")}
              </Label>
              <Textarea
                id="edit-db-instructions"
                value={editExerciseInstructions.join('\n')}
                onChange={(e) => setEditExerciseInstructions(e.target.value.split('\n').map(s => s.trim()))}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-db-images" className="text-right mt-1">
                {t("exerciseCard.images", "Images")}
              </Label>
              <div className="col-span-3">
                <Input
                  id="edit-db-images"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files) {
                      const filesArray = Array.from(e.target.files);
                      setNewExerciseImageFiles((prev) => [...prev, ...filesArray]);
                      filesArray.forEach((file) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setNewExerciseImageUrls((prev) => [...prev, reader.result as string]);
                        };
                        reader.readAsDataURL(file);
                      });
                    }
                  }}
                  className="col-span-3"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {editExerciseImages.map((url, index) => (
                    <div
                      key={`existing-${index}`}
                      draggable
                      onDragStart={(e) => setDraggedImageIndex(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedImageIndex === null) return;
                        const newImages = [...editExerciseImages];
                        const [draggedItem] = newImages.splice(draggedImageIndex, 1);
                        newImages.splice(index, 0, draggedItem);
                        setEditExerciseImages(newImages);
                        setDraggedImageIndex(null);
                      }}
                      className="relative w-24 h-24 cursor-grab"
                    >
                      <img src={url.startsWith('http') ? url : `/uploads/exercises/${url}`} alt={`existing ${index}`} className="w-full h-full object-cover rounded" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                        onClick={() => setEditExerciseImages((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {newExerciseImageUrls.map((url, index) => (
                    <div
                      key={`new-${index}`}
                      draggable
                      onDragStart={(e) => setDraggedImageIndex(editExerciseImages.length + index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedImageIndex === null) return;

                        const allImages = [...editExerciseImages, ...newExerciseImageUrls];
                        const allFiles = [...newExerciseImageFiles];

                        const targetIndex = index + editExerciseImages.length;

                        if (draggedImageIndex < editExerciseImages.length) { // Dragging an existing image
                          const newExistingImages = [...editExerciseImages];
                          const [draggedItem] = newExistingImages.splice(draggedImageIndex, 1);
                          newExistingImages.splice(targetIndex, 0, draggedItem);
                          setEditExerciseImages(newExistingImages);
                        } else { // Dragging a new image
                          const newNewImageFiles = [...newExerciseImageFiles];
                          const newNewImageUrls = [...newExerciseImageUrls];

                          const draggedNewImageIndex = draggedImageIndex - editExerciseImages.length;
                          const [draggedFile] = newNewImageFiles.splice(draggedNewImageIndex, 1);
                          const [draggedUrl] = newNewImageUrls.splice(draggedNewImageIndex, 1);

                          newNewImageFiles.splice(targetIndex - editExerciseImages.length, 0, draggedFile);
                          newNewImageUrls.splice(targetIndex - editExerciseImages.length, 0, draggedUrl);

                          setNewExerciseImageFiles(newNewImageFiles);
                          setNewExerciseImageUrls(newNewImageUrls);
                        }
                        setDraggedImageIndex(null);
                      }}
                      className="relative w-24 h-24 cursor-grab"
                    >
                      <img src={url} alt={`preview ${index}`} className="w-full h-full object-cover rounded" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                        onClick={() => {
                          setNewExerciseImageFiles((prev) => prev.filter((_, i) => i !== index));
                          setNewExerciseImageUrls((prev) => prev.filter((_, i) => i !== index));
                        }}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-db-description" className="text-right mt-1">
                {t("exerciseCard.description", "Description")}
              </Label>
              <Textarea
                id="edit-db-description"
                value={editExerciseDescription}
                onChange={(e) => setEditExerciseDescription(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
        )}
        <Button onClick={handleSaveExerciseDatabaseEdit}>{t("exerciseCard.saveChanges", "Save Changes")}</Button>
      </DialogContent>
    </Dialog>
  );
};

export default EditExerciseDatabaseDialog;