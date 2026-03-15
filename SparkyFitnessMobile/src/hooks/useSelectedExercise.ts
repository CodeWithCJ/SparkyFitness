import { useEffect, useRef } from 'react';
import type { Exercise } from '../types/exercise';

interface RouteParamsWithExercise {
  selectedExercise?: Exercise;
  selectionNonce?: number;
}

export function useSelectedExercise(
  params: RouteParamsWithExercise | undefined,
  onSelect: (exercise: Exercise) => void,
): void {
  const lastNonceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const selectedExercise = params?.selectedExercise;
    const nonce = params?.selectionNonce;
    if (selectedExercise && nonce && nonce !== lastNonceRef.current) {
      lastNonceRef.current = nonce;
      onSelect(selectedExercise);
    }
  }, [params?.selectedExercise, params?.selectionNonce, onSelect]);
}
