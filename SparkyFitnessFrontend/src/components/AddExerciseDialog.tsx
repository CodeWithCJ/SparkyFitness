import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ExerciseSearch from "./ExerciseSearch";
import WorkoutPresetSelector from "./WorkoutPresetSelector"; // Import WorkoutPresetSelector
import ExerciseImportCSV, { ExerciseCSVData } from "./ExerciseImportCSV"; // Renamed import and import ExerciseCSVData
import ExerciseEntryHistoryImportCSV from "./ExerciseEntryHistoryImportCSV"; // Import new component
import { createExercise, Exercise } from "@/services/exerciseService";
import { WorkoutPreset } from "@/types/workout"; // Import WorkoutPreset type
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { PlusCircle, XCircle } from "lucide-react";
import { apiCall } from "@/services/api"; // Import apiCall

interface AddExerciseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExerciseAdded: (exercise?: Exercise, sourceMode?: 'internal' | 'external' | 'custom' | 'preset') => void;
  onWorkoutPresetSelected?: (preset: WorkoutPreset) => void; // New prop for selecting a workout preset
  mode: 'preset' | 'workout-plan' | 'diary' | 'database-manager';
}

const AddExerciseDialog = ({ open, onOpenChange, onExerciseAdded, mode, onWorkoutPresetSelected }: AddExerciseDialogProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(mode === 'database-manager' ? 'online' : 'my-exercises');
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseCategory, setNewExerciseCategory] = useState("general");
  const [newExerciseCalories, setNewExerciseCalories] = useState(300); // Default calculated calories
  const [manualCaloriesPerHour, setManualCaloriesPerHour] = useState<number | undefined>(undefined); // For manual override
  const [newExerciseDescription, setNewExerciseDescription] = useState("");
  const [newExerciseSource, setNewExerciseSource] = useState("custom"); // Default to "custom"
  const [newExerciseForce, setNewExerciseForce] = useState("");
  const [newExerciseLevel, setNewExerciseLevel] = useState("");
  const [newExerciseMechanic, setNewExerciseMechanic] = useState("");
  const [newExerciseEquipment, setNewExerciseEquipment] = useState("");
  const [newExercisePrimaryMuscles, setNewExercisePrimaryMuscles] = useState("");
  const [newExerciseSecondaryMuscles, setNewExerciseSecondaryMuscles] = useState("");
  const [newExerciseInstructions, setNewExerciseInstructions] = useState("");
  const [newExerciseImages, setNewExerciseImages] = useState<File[]>([]); // State to hold image files
  const [newExerciseImageUrls, setNewExerciseImageUrls] = useState<string[]>([]); // State to hold image URLs for display
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null); // For reordering

  const handleExerciseSelect = (exercise: Exercise, sourceMode: 'internal' | 'external') => {
    toast({
      title: t('common.success', 'Success'),
      description: t('exercise.addExerciseDialog.addSuccess', 'Exercise added successfully'),
    });
    onExerciseAdded(exercise, sourceMode); // Pass the selected exercise and source mode
    onOpenChange(false);
  };

  const handleAddCustomExercise = async () => {
    if (!user) return;
    try {
      const newExercise = {
        name: newExerciseName,
        category: newExerciseCategory,
        calories_per_hour: manualCaloriesPerHour !== undefined ? manualCaloriesPerHour : newExerciseCalories, // Use manual if provided
        description: newExerciseDescription,
        user_id: user.id,
        is_custom: true,
        source: newExerciseSource,
        force: newExerciseForce,
        level: newExerciseLevel,
        mechanic: newExerciseMechanic,
        equipment: newExerciseEquipment.split(',').map(s => s.trim()).filter(s => s),
        primary_muscles: newExercisePrimaryMuscles.split(',').map(s => s.trim()).filter(s => s),
        secondary_muscles: newExerciseSecondaryMuscles.split(',').map(s => s.trim()).filter(s => s),
        instructions: newExerciseInstructions.split('\n').map(s => s.trim()).filter(s => s),
        // images: newExerciseImageUrls, // Do not send URLs to backend, server will handle based on uploaded files
      };

      const formData = new FormData();
      formData.append('exerciseData', JSON.stringify(newExercise));
      newExerciseImages.forEach((file) => {
        formData.append('images', file);
      });

      await createExercise(formData);
      toast({
        title: t('common.success', 'Success'),
        description: t('exercise.addExerciseDialog.addSuccess', 'Exercise added successfully'),
      });
      // Assuming the newly created exercise is returned by createExercise
      // For now, we'll just pass a placeholder or refetch if necessary.
      // A more robust solution would be to return the created exercise from createExercise.
      onExerciseAdded({ id: 'temp-id', name: newExerciseName, category: newExerciseCategory, calories_per_hour: manualCaloriesPerHour !== undefined ? manualCaloriesPerHour : newExerciseCalories }, 'custom');
      onOpenChange(false);
      setNewExerciseName("");
      setNewExerciseCategory("general");
      setNewExerciseCalories(300);
      setNewExerciseDescription("");
      setNewExerciseSource("custom");
      setNewExerciseForce("");
      setNewExerciseLevel("");
      setNewExerciseMechanic("");
      setNewExerciseEquipment("");
      setNewExercisePrimaryMuscles("");
      setNewExerciseSecondaryMuscles("");
      setNewExerciseInstructions("");
      setNewExerciseImages([]);
      setNewExerciseImageUrls([]);
    } catch (error) {
      console.error("Error adding exercise:", error);
      toast({
        title: t('common.error', 'Error'),
        description: t('exercise.addExerciseDialog.addError', 'Failed to add exercise'),
        variant: "destructive",
      });
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setNewExerciseImages((prevImages) => [...prevImages, ...filesArray]);
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
    setNewExerciseImages((prevImages) => prevImages.filter((_, index) => index !== indexToRemove));
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

    const reorderedImages = [...newExerciseImages];
    const reorderedUrls = [...newExerciseImageUrls];

    const [draggedFile] = reorderedImages.splice(draggedImageIndex, 1);
    const [draggedUrl] = reorderedUrls.splice(draggedImageIndex, 1);

    reorderedImages.splice(index, 0, draggedFile);
    reorderedUrls.splice(index, 0, draggedUrl);

    setNewExerciseImages(reorderedImages);
    setNewExerciseImageUrls(reorderedUrls);
    setDraggedImageIndex(null);
  };

  const handleImportFromCSV = async (exerciseDataArray: Omit<ExerciseCSVData, "id">[]) => {
    try {
      const res = await apiCall(`/exercises/import-json`, {
        method: "POST",
        body: JSON.stringify({ exercises: exerciseDataArray }),
      });

      toast({
        title: t('common.success', 'Success'),
        description: t('exercise.addExerciseDialog.importSuccess', 'Exercise data imported successfully'),
      });
      onOpenChange(false);
    } catch (error) {
      if (error?.status === 409 && error.data?.duplicates) {
        const duplicateList = error.data.duplicates
          .map(
            (d: { name: string }) => `"${d.name}"`
          )
          .join(", ");

        toast({
          title: t('exercise.addExerciseDialog.importDuplicateTitle', 'Import Failed: Duplicate Items Found'),
          description: t('exercise.addExerciseDialog.importDuplicateDescription', 'The following items already exist: {{duplicateList}}. Please remove them from your file and try again.', { duplicateList }),
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({
          title: t('common.errorOccurred', 'An Error Occurred'),
          description:
            error.message || t('exercise.addExerciseDialog.importError', 'Failed to import exercise data. Please try again.'),
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={activeTab === 'import-csv' || activeTab === 'import-history-csv' ? "sm:max-w-[95vw] sm:max-h-[95vh] w-[95vw] h-[95vh] overflow-y-auto" : "sm:max-w-[800px] overflow-y-auto max-h-[90vh]"}>
        <DialogHeader>
          <DialogTitle className="text-center">{t('exercise.addExerciseDialog.title', 'Add Exercise')}</DialogTitle>
          <DialogDescription className="text-center">
            {t('exercise.addExerciseDialog.description', 'Add a new exercise to your database, either by creating a custom one or importing from an external source.')}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex w-full justify-center flex-wrap">
            {mode !== 'database-manager' && <TabsTrigger value="my-exercises">{t('exercise.addExerciseDialog.myExercisesTab', 'My Exercises')}</TabsTrigger>}
            {(mode === 'diary' || mode === 'workout-plan') && <TabsTrigger value="workout-preset">{t('exercise.addExerciseDialog.workoutPresetTab', 'Workout Preset')}</TabsTrigger>}
            <TabsTrigger value="online">{t('exercise.addExerciseDialog.onlineTab', 'Online')}</TabsTrigger>
            <TabsTrigger value="custom">{t('exercise.addExerciseDialog.addCustomTab', 'Add Custom')}</TabsTrigger>
            <TabsTrigger value="import-csv">{t('exercise.addExerciseDialog.importCSVTab', 'Import Exercises')}</TabsTrigger>
            {(mode === 'diary') && <TabsTrigger value="import-history-csv">{t('exercise.addExerciseDialog.importHistoryCSVTab', 'Import History')}</TabsTrigger>}
          </TabsList>
          {mode !== 'database-manager' && (
            <TabsContent value="my-exercises">
              <div className="pt-4">
                <ExerciseSearch
                  onExerciseSelect={(exercise, source) => handleExerciseSelect(exercise, source)}
                  disableTabs={true}
                  initialSearchSource="internal"
                />
              </div>
            </TabsContent>
          )}
          <TabsContent value="online">
            <div className="pt-4">
              <ExerciseSearch
                onExerciseSelect={(exercise, source) => handleExerciseSelect(exercise, source)}
                disableTabs={true}
                initialSearchSource="external"
              />
            </div>
          </TabsContent>
          <TabsContent value="custom" className="overflow-y-auto max-h-full">
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  {t('exercise.addExerciseDialog.nameLabel', 'Name')}
                </Label>
                <Input
                  id="name"
                  value={newExerciseName}
                  onChange={(e) => setNewExerciseName(e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="category" className="text-right">
                  {t('exercise.addExerciseDialog.categoryLabel', 'Category')}
                </Label>
                <Select onValueChange={setNewExerciseCategory} defaultValue={newExerciseCategory}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={t('exercise.addExerciseDialog.selectCategoryPlaceholder', 'Select a category')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">{t('exercise.addExerciseDialog.categoryGeneral', 'General')}</SelectItem>
                    <SelectItem value="strength">{t('exercise.addExerciseDialog.categoryStrength', 'Strength')}</SelectItem>
                    <SelectItem value="cardio">{t('exercise.addExerciseDialog.categoryCardio', 'Cardio')}</SelectItem>
                    <SelectItem value="yoga">{t('exercise.addExerciseDialog.categoryYoga', 'Yoga')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="calories" className="text-right">
                  {t('exercise.addExerciseDialog.caloriesPerHourLabel', 'Calories/Hour')}
                </Label>
                <Input
                  id="calories"
                  type="number"
                  value={manualCaloriesPerHour !== undefined ? manualCaloriesPerHour.toString() : newExerciseCalories.toString()}
                  onChange={(e) => setManualCaloriesPerHour(Number(e.target.value))}
                  placeholder="Calculated: 300" // Show calculated as placeholder
                  className="col-span-3"
                />
                <p className="col-span-4 text-xs text-muted-foreground">
                  {t('exercise.addExerciseDialog.caloriesPerHourHint', 'Leave blank to use system calculated calories per hour ({{newExerciseCalories}} cal/hour).', { newExerciseCalories })}
                </p>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="description" className="text-right mt-1">
                  {t('exercise.addExerciseDialog.descriptionLabel', 'Description')}
                </Label>
                <Textarea
                  id="description"
                  value={newExerciseDescription}
                  onChange={(e) => setNewExerciseDescription(e.target.value)}
                  className="col-span-3"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="source" className="text-right">
                  {t('exercise.addExerciseDialog.sourceLabel', 'Source')}
                </Label>
                <Input
                  id="source"
                  value={newExerciseSource}
                  onChange={(e) => setNewExerciseSource(e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="force" className="text-right">
                  {t('exercise.addExerciseDialog.forceLabel', 'Force')}
                </Label>
                <Select onValueChange={setNewExerciseForce} defaultValue={newExerciseForce}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={t('exercise.addExerciseDialog.selectForcePlaceholder', 'Select force')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pull">{t('exercise.addExerciseDialog.forcePull', 'Pull')}</SelectItem>
                    <SelectItem value="push">{t('exercise.addExerciseDialog.forcePush', 'Push')}</SelectItem>
                    <SelectItem value="static">{t('exercise.addExerciseDialog.forceStatic', 'Static')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="level" className="text-right">
                  {t('exercise.addExerciseDialog.levelLabel', 'Level')}
                </Label>
                <Select onValueChange={setNewExerciseLevel} defaultValue={newExerciseLevel}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={t('exercise.addExerciseDialog.selectLevelPlaceholder', 'Select level')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">{t('exercise.addExerciseDialog.levelBeginner', 'Beginner')}</SelectItem>
                    <SelectItem value="intermediate">{t('exercise.addExerciseDialog.levelIntermediate', 'Intermediate')}</SelectItem>
                    <SelectItem value="expert">{t('exercise.addExerciseDialog.levelExpert', 'Expert')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="mechanic" className="text-right">
                  {t('exercise.addExerciseDialog.mechanicLabel', 'Mechanic')}
                </Label>
                <Select onValueChange={setNewExerciseMechanic} defaultValue={newExerciseMechanic}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={t('exercise.addExerciseDialog.selectMechanicPlaceholder', 'Select mechanic')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="isolation">{t('exercise.addExerciseDialog.mechanicIsolation', 'Isolation')}</SelectItem>
                    <SelectItem value="compound">{t('exercise.addExerciseDialog.mechanicCompound', 'Compound')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="equipment" className="text-right mt-1">
                  {t('exercise.addExerciseDialog.equipmentLabel', 'Equipment (comma-separated)')}
                </Label>
                <Textarea
                  id="equipment"
                  value={newExerciseEquipment}
                  onChange={(e) => setNewExerciseEquipment(e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="primaryMuscles" className="text-right mt-1">
                  {t('exercise.addExerciseDialog.primaryMusclesLabel', 'Primary Muscles (comma-separated)')}
                </Label>
                <Textarea
                  id="primaryMuscles"
                  value={newExercisePrimaryMuscles}
                  onChange={(e) => setNewExercisePrimaryMuscles(e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="secondaryMuscles" className="text-right mt-1">
                  {t('exercise.addExerciseDialog.secondaryMusclesLabel', 'Secondary Muscles (comma-separated)')}
                </Label>
                <Textarea
                  id="secondaryMuscles"
                  value={newExerciseSecondaryMuscles}
                  onChange={(e) => setNewExerciseSecondaryMuscles(e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="instructions" className="text-right mt-1">
                  {t('exercise.addExerciseDialog.instructionsLabel', 'Instructions (one per line)')}
                </Label>
                <Textarea
                  id="instructions"
                  value={newExerciseInstructions}
                  onChange={(e) => setNewExerciseInstructions(e.target.value)}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="images" className="text-right mt-1">
                  {t('exercise.addExerciseDialog.imagesLabel', 'Images')}
                </Label>
                <div className="col-span-3">
                  <Input
                    id="images"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageChange}
                    className="col-span-3"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {newExerciseImageUrls.map((url, index) => (
                      <div
                        key={index}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, index)}
                        className="relative w-24 h-24 cursor-grab"
                      >
                        <img src={url} alt={`preview ${index}`} className="w-full h-full object-cover rounded" />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                          onClick={() => handleRemoveImage(index)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            <Button onClick={handleAddCustomExercise}>{t('exercise.addExerciseDialog.addButton', 'Add Exercise')}</Button>
          </TabsContent>
          <TabsContent value="import-csv">
            <div className="pt-4">
              <ExerciseImportCSV
                onSave={handleImportFromCSV} // Use the new onSave prop
              />
            </div>
          </TabsContent>
          {(mode === 'diary') && (
            <TabsContent value="import-history-csv">
              <div className="pt-4">
                <ExerciseEntryHistoryImportCSV onImportComplete={() => {
                  onOpenChange(false);
                  onExerciseAdded(); // Trigger refresh in parent without passing a full exercise object
                }} />
              </div>
            </TabsContent>
          )}
          {(mode === 'diary' || mode === 'workout-plan') && (
            <TabsContent value="workout-preset">
              <div className="pt-4">
                <WorkoutPresetSelector
                  onPresetSelected={(preset) => {
                    if (onWorkoutPresetSelected) {
                      onWorkoutPresetSelected(preset);
                    }
                    onOpenChange(false); // Close the dialog after selecting a preset
                  }}
                />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AddExerciseDialog;