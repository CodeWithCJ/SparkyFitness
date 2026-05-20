import { useMutation } from '@tanstack/react-query';
import type { FoodPhotoEstimateResponse } from '@workspace/shared';
import {
  estimateFoodPhoto,
  FoodPhotoEstimateError,
  type EstimateFoodPhotoInput,
} from '../services/api/externalFoodSearchApi';

export function useEstimateFoodPhoto() {
  return useMutation<FoodPhotoEstimateResponse, FoodPhotoEstimateError, EstimateFoodPhotoInput>({
    mutationFn: estimateFoodPhoto,
  });
}
