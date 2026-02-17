import {
  getFreeExerciseDBEquipment,
  getFreeExerciseDBMuscleGroups,
} from '@/api/Exercises/freeExerciseDB';
import { freeExerciseDBKeys } from '@/api/keys/exercises';
import { useQuery } from '@tanstack/react-query';

export const useFreeExerciseDBMuscleGroups = () => {
  return useQuery({
    queryKey: freeExerciseDBKeys.muscles(),
    queryFn: getFreeExerciseDBMuscleGroups,
  });
};

export const useFreeExerciseDBEquipment = () => {
  return useQuery({
    queryKey: freeExerciseDBKeys.equipment(),
    queryFn: getFreeExerciseDBEquipment,
  });
};
