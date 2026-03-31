import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { saveDraft, loadDraft, clearDraft } from '../services/workoutDraftService';
import type { FormDraft } from '../types/drafts';

interface UseDraftPersistenceOptions<T extends FormDraft> {
  state: T;
  draftType: T['type'];
  isEditMode: boolean;
  skipDraftLoad: boolean;
  onDraftLoaded: (draft: T) => void;
  onInitialDate?: () => void;
}

interface DraftPersistenceControls {
  clearPersistedDraft: () => Promise<void>;
}

export function useDraftPersistence<T extends FormDraft>(options: UseDraftPersistenceOptions<T>): DraftPersistenceControls {
  const { state, draftType, isEditMode, skipDraftLoad, onDraftLoaded, onInitialDate } = options;

  const isDraftLoadedRef = useRef(false);
  const skipNextSaveRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistenceEnabledRef = useRef(true);
  const stateRef = useRef(state);
  stateRef.current = state;
  const isEditModeRef = useRef(isEditMode);
  isEditModeRef.current = isEditMode;

  const cancelPendingSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  const disablePersistence = useCallback(() => {
    persistenceEnabledRef.current = false;
    cancelPendingSave();
  }, [cancelPendingSave]);

  const clearPersistedDraft = useCallback(async () => {
    disablePersistence();
    await clearDraft();
  }, [disablePersistence]);

  useEffect(() => {
    if (isEditMode || skipDraftLoad) {
      if (skipDraftLoad) {
        onInitialDate?.();
        skipNextSaveRef.current = true;
      }
      isDraftLoadedRef.current = true;
      return;
    }
    loadDraft().then(draft => {
      if (draft && draft.type === draftType) {
        skipNextSaveRef.current = true;
        onDraftLoaded(draft as T);
      } else {
        onInitialDate?.();
      }
      isDraftLoadedRef.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, skipDraftLoad, draftType]);

  useEffect(() => {
    if (isEditMode) return;
    if (!isDraftLoadedRef.current) return;
    if (!persistenceEnabledRef.current) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    cancelPendingSave();
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      saveDraft(state);
    }, 300);

    return () => {
      cancelPendingSave();
    };
  }, [state, isEditMode, cancelPendingSave]);

  // Flush unsaved changes on unmount. This must NOT depend on saveTimeoutRef
  // because React cleans up effects in declaration order — the debounced save
  // effect above clears the ref before this cleanup runs.
  useEffect(() => {
    return () => {
      cancelPendingSave();
      if (!isEditModeRef.current && persistenceEnabledRef.current) {
        saveDraft(stateRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isEditMode) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        cancelPendingSave();
        if (!persistenceEnabledRef.current) return;
        saveDraft(stateRef.current);
      }
    });
    return () => subscription.remove();
  }, [isEditMode, cancelPendingSave]);

  return {
    clearPersistedDraft,
  };
}
