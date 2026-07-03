// hooks/Exercises/useEditExerciseForm.ts
import { useState } from 'react';
import { error } from '@/utils/logging';
import type { Exercise as ExerciseInterface } from '@/types/exercises';
import {
  useUpdateExerciseMutation,
  useUpdateExerciseEntriesSnapshotMutation,
} from '@/hooks/Exercises/useExercises';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/hooks/useAuth';

export function useEditExerciseForm() {
  const { user } = useAuth();
  const { loggingLevel, energyUnit, convertEnergy } = usePreferences();

  const { mutateAsync: updateExercise } = useUpdateExerciseMutation();
  const { mutateAsync: updateExerciseEntriesSnapshot } =
    useUpdateExerciseEntriesSnapshotMutation();

  // Dialog open state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] =
    useState<ExerciseInterface | null>(null);

  // Sync confirmation state
  const [showSyncConfirmation, setShowSyncConfirmation] = useState(false);
  const [syncExerciseId, setSyncExerciseId] = useState<string | null>(null);

  // Form fields
  const [editExerciseName, setEditExerciseName] = useState('');
  const [editExerciseCategory, setEditExerciseCategory] = useState('general');
  const [editExerciseCalories, setEditExerciseCalories] = useState(300);
  const [editExerciseDescription, setEditExerciseDescription] = useState('');
  const [editExerciseLevel, setEditExerciseLevel] = useState('');
  const [editExerciseForce, setEditExerciseForce] = useState('');
  const [editExerciseMechanic, setEditExerciseMechanic] = useState('');
  const [editExerciseEquipment, setEditExerciseEquipment] = useState<string[]>(
    []
  );
  const [editExercisePrimaryMuscles, setEditExercisePrimaryMuscles] = useState<
    string[]
  >([]);
  const [editExerciseSecondaryMuscles, setEditExerciseSecondaryMuscles] =
    useState<string[]>([]);
  const [editExerciseInstructions, setEditExerciseInstructions] = useState<
    string[]
  >([]);
  const [editExerciseImages, setEditExerciseImages] = useState<string[]>([]);
  const [newExerciseImageFiles, setNewExerciseImageFiles] = useState<File[]>(
    []
  );
  const [newExerciseImageUrls, setNewExerciseImageUrls] = useState<string[]>(
    []
  );
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(
    null
  );

  const openEditDialog = (exercise: ExerciseInterface) => {
    setSelectedExercise(exercise);
    setEditExerciseName(exercise.name);
    setEditExerciseCategory(exercise.category || 'general');
    setEditExerciseCalories(
      Math.round(
        convertEnergy(exercise.calories_per_hour ?? 0, 'kcal', energyUnit)
      )
    );
    setEditExerciseDescription(exercise.description || '');
    setEditExerciseLevel(exercise.level?.toLowerCase() || '');
    setEditExerciseForce(exercise.force?.toLowerCase() || '');
    setEditExerciseMechanic(exercise.mechanic?.toLowerCase() || '');
    setEditExerciseEquipment(
      Array.isArray(exercise.equipment) ? exercise.equipment : []
    );
    setEditExercisePrimaryMuscles(
      Array.isArray(exercise.primary_muscles) ? exercise.primary_muscles : []
    );
    setEditExerciseSecondaryMuscles(
      Array.isArray(exercise.secondary_muscles)
        ? exercise.secondary_muscles
        : []
    );
    setEditExerciseInstructions(
      Array.isArray(exercise.instructions) ? exercise.instructions : []
    );
    setEditExerciseImages(
      Array.isArray(exercise.images) ? exercise.images : []
    );
    setNewExerciseImageFiles([]);
    setNewExerciseImageUrls([]);
    setIsEditDialogOpen(true);
  };

  const handleEditExercise = async () => {
    if (!selectedExercise) return;
    try {
      const formData = new FormData();
      const updatedExerciseData: Partial<ExerciseInterface> = {
        name: editExerciseName,
        category: editExerciseCategory,
        calories_per_hour: convertEnergy(
          editExerciseCalories,
          energyUnit,
          'kcal'
        ),
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
      newExerciseImageFiles.forEach((file) => formData.append('images', file));

      await updateExercise({ id: selectedExercise.id, payload: formData });

      if (user?.id === selectedExercise.user_id) {
        setSyncExerciseId(selectedExercise.id);
        setShowSyncConfirmation(true);
      }
      setIsEditDialogOpen(false);
      setSelectedExercise(null);
      setNewExerciseImageFiles([]);
      setNewExerciseImageUrls([]);
    } catch (err) {
      error(loggingLevel, 'Error editing exercise:', err);
    }
  };

  const handleSyncConfirmation = async () => {
    if (syncExerciseId) {
      await updateExerciseEntriesSnapshot(syncExerciseId);
    }
    setShowSyncConfirmation(false);
    setSyncExerciseId(null);
  };

  const handleDrop = (targetIndex: number, isNewImage: boolean) => {
    if (draggedImageIndex === null) return;

    const isDraggedNew = draggedImageIndex >= editExerciseImages.length;

    if (isDraggedNew !== isNewImage) {
      setDraggedImageIndex(null);
      return;
    }

    if (!isDraggedNew) {
      const updated = [...editExerciseImages];
      const [item] = updated.splice(draggedImageIndex, 1);
      if (item) updated.splice(targetIndex, 0, item);
      setEditExerciseImages(updated);
    } else {
      const draggedNewIndex = draggedImageIndex - editExerciseImages.length;
      const targetNewIndex = targetIndex - editExerciseImages.length;

      const updatedFiles = [...newExerciseImageFiles];
      const updatedUrls = [...newExerciseImageUrls];

      const [draggedFile] = updatedFiles.splice(draggedNewIndex, 1);
      const [draggedUrl] = updatedUrls.splice(draggedNewIndex, 1);

      if (draggedFile) updatedFiles.splice(targetNewIndex, 0, draggedFile);
      if (draggedUrl) updatedUrls.splice(targetNewIndex, 0, draggedUrl);

      setNewExerciseImageFiles(updatedFiles);
      setNewExerciseImageUrls(updatedUrls);
    }

    setDraggedImageIndex(null);
  };

  const handleImageFileChange = (files: FileList) => {
    const filesArray = Array.from(files);
    setNewExerciseImageFiles((prev) => [...prev, ...filesArray]);
    const newUrls = filesArray.map((file) => URL.createObjectURL(file));
    setNewExerciseImageUrls((prev) => [...prev, ...newUrls]);
  };

  const removeExistingImage = (index: number) => {
    setEditExerciseImages((prev) => prev.filter((_, i) => i !== index));
  };

  const removeNewImage = (index: number) => {
    setNewExerciseImageFiles((prev) => prev.filter((_, i) => i !== index));
    setNewExerciseImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  return {
    isEditDialogOpen,
    setIsEditDialogOpen,
    selectedExercise,
    openEditDialog,
    showSyncConfirmation,
    setShowSyncConfirmation,
    handleSyncConfirmation,
    editExerciseName,
    setEditExerciseName,
    editExerciseCategory,
    setEditExerciseCategory,
    editExerciseCalories,
    setEditExerciseCalories,
    editExerciseDescription,
    setEditExerciseDescription,
    editExerciseLevel,
    setEditExerciseLevel,
    editExerciseForce,
    setEditExerciseForce,
    editExerciseMechanic,
    setEditExerciseMechanic,
    editExerciseEquipment,
    setEditExerciseEquipment,
    editExercisePrimaryMuscles,
    setEditExercisePrimaryMuscles,
    editExerciseSecondaryMuscles,
    setEditExerciseSecondaryMuscles,
    editExerciseInstructions,
    setEditExerciseInstructions,
    editExerciseImages,
    newExerciseImageUrls,
    draggedImageIndex,
    setDraggedImageIndex,
    handleEditExercise,
    handleDrop,
    handleImageFileChange,
    removeExistingImage,
    removeNewImage,
  };
}
