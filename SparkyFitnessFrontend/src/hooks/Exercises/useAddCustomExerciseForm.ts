import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCreateExerciseMutation } from '@/hooks/Exercises/useExercises';
import type { Exercise } from '@/types/exercises';

export function useAddCustomExerciseForm(
  onExerciseAdded: (
    exercise?: Exercise,
    sourceMode?: 'internal' | 'external' | 'custom' | 'preset'
  ) => void,
  onOpenChange: (open: boolean) => void
) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { mutateAsync: createExercise } = useCreateExerciseMutation();

  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseCategory, setNewExerciseCategory] = useState('general');
  const [newExerciseCalories, setNewExerciseCalories] = useState(300);
  const [manualCaloriesPerHour, setManualCaloriesPerHour] = useState<
    number | undefined
  >(undefined);
  const [newExerciseDescription, setNewExerciseDescription] = useState('');
  const [newExerciseSource, setNewExerciseSource] = useState('custom');
  const [newExerciseForce, setNewExerciseForce] = useState('');
  const [newExerciseLevel, setNewExerciseLevel] = useState('');
  const [newExerciseMechanic, setNewExerciseMechanic] = useState('');
  const [newExerciseEquipment, setNewExerciseEquipment] = useState('');
  const [newExercisePrimaryMuscles, setNewExercisePrimaryMuscles] =
    useState('');
  const [newExerciseSecondaryMuscles, setNewExerciseSecondaryMuscles] =
    useState('');
  const [newExerciseInstructions, setNewExerciseInstructions] = useState('');
  const [newExerciseImages, setNewExerciseImages] = useState<File[]>([]);
  const [newExerciseImageUrls, setNewExerciseImageUrls] = useState<string[]>(
    []
  );
  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(
    null
  );
  const imageUrisRef = useRef<string[]>([]);

  const reset = () => {
    setNewExerciseName('');
    setNewExerciseCategory('general');
    setNewExerciseCalories(300);
    setManualCaloriesPerHour(undefined);
    setNewExerciseDescription('');
    setNewExerciseSource('custom');
    setNewExerciseForce('');
    setNewExerciseLevel('');
    setNewExerciseMechanic('');
    setNewExerciseEquipment('');
    setNewExercisePrimaryMuscles('');
    setNewExerciseSecondaryMuscles('');
    setNewExerciseInstructions('');
    setNewExerciseImages([]);
    setNewExerciseImageUrls([]);
  };

  const handleAddCustomExercise = async () => {
    if (!user) return;
    try {
      const newExercise = {
        name: newExerciseName,
        category: newExerciseCategory,
        calories_per_hour:
          manualCaloriesPerHour !== undefined
            ? manualCaloriesPerHour
            : newExerciseCalories,
        description: newExerciseDescription,
        user_id: user.id,
        is_custom: true,
        source: newExerciseSource,
        force: newExerciseForce,
        level: newExerciseLevel,
        mechanic: newExerciseMechanic,
        equipment: newExerciseEquipment
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        primary_muscles: newExercisePrimaryMuscles
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        secondary_muscles: newExerciseSecondaryMuscles
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        instructions: newExerciseInstructions
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const formData = new FormData();
      formData.append('exerciseData', JSON.stringify(newExercise));
      newExerciseImages.forEach((file) => formData.append('images', file));

      const createdExercise = await createExercise(formData);
      toast({
        title: t('common.success', 'Success'),
        description: t(
          'exercise.addExerciseDialog.addSuccess',
          'Exercise added successfully'
        ),
      });
      onExerciseAdded(createdExercise, 'custom');
      onOpenChange(false);
      reset();
    } catch (error) {
      console.error('Error adding exercise:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'exercise.addExerciseDialog.addError',
          'Failed to add exercise'
        ),
        variant: 'destructive',
      });
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);
    setNewExerciseImages((prev) => [...prev, ...filesArray]);

    const newUrls = filesArray.map((file) => URL.createObjectURL(file));
    imageUrisRef.current.push(...newUrls);

    setNewExerciseImageUrls((prev) => [...prev, ...newUrls]);
  };

  useEffect(() => {
    const currentUris = imageUrisRef.current;

    return () => {
      currentUris.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const handleRemoveImage = (index: number) => {
    setNewExerciseImages((prev) => prev.filter((_, i) => i !== index));
    setNewExerciseImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    index: number
  ) => {
    setDraggedImageIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (draggedImageIndex === null || draggedImageIndex === index) return;

    const reorderedImages = [...newExerciseImages];
    const reorderedUrls = [...newExerciseImageUrls];
    const [draggedFile] = reorderedImages.splice(draggedImageIndex, 1);
    const [draggedUrl] = reorderedUrls.splice(draggedImageIndex, 1);
    if (draggedFile) reorderedImages.splice(index, 0, draggedFile);
    if (draggedUrl) reorderedUrls.splice(index, 0, draggedUrl);

    setNewExerciseImages(reorderedImages);
    setNewExerciseImageUrls(reorderedUrls);
    setDraggedImageIndex(null);
  };

  return {
    newExerciseName,
    setNewExerciseName,
    newExerciseCategory,
    setNewExerciseCategory,
    newExerciseCalories,
    manualCaloriesPerHour,
    setManualCaloriesPerHour,
    newExerciseDescription,
    setNewExerciseDescription,
    newExerciseSource,
    setNewExerciseSource,
    newExerciseForce,
    setNewExerciseForce,
    newExerciseLevel,
    setNewExerciseLevel,
    newExerciseMechanic,
    setNewExerciseMechanic,
    newExerciseEquipment,
    setNewExerciseEquipment,
    newExercisePrimaryMuscles,
    setNewExercisePrimaryMuscles,
    newExerciseSecondaryMuscles,
    setNewExerciseSecondaryMuscles,
    newExerciseInstructions,
    setNewExerciseInstructions,
    newExerciseImageUrls,
    handleAddCustomExercise,
    handleImageChange,
    handleRemoveImage,
    handleDragStart,
    handleDragOver,
    handleDrop,
  };
}
