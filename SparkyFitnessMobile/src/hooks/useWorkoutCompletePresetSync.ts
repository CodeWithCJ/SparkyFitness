import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AppState } from 'react-native';
import Toast from 'react-native-toast-message';
import { useIsFocused } from '@react-navigation/native';
import type { PresetSessionResponse } from '@workspace/shared';
import { useProfile } from './useProfile';
import { useUpdateWorkoutPreset } from './useWorkoutPresetMutations';
import { getWorkoutPresetById } from '../services/api/workoutPresetsApi';
import { getActiveServerConfig } from '../services/storage';
import {
  buildPresetUpdateExercises,
  type AssumedSetValues,
  type AssumedValueSources,
} from '../utils/workoutSession';
import type { WorkoutPreset } from '../types/workoutPresets';
import type { CompletedSetMap } from '../stores/activeWorkoutStore';

const UPDATE_PRESET_PROMPT_DELAY_MS = 800;

// Anything but background/inactive counts as in front, so a state that is
// not reported yet does not hold the prompt back.
function isAppInBackground(state: string | null | undefined): boolean {
  return state === 'background' || state === 'inactive';
}

export interface PresetUpdateOffer {
  presetName: string;
  /** Writes the workout's exercises into the preset. Resolves false when the write fails, so the question can be asked again. */
  update: () => Promise<boolean>;
}

interface UseWorkoutCompletePresetSyncArgs {
  session: PresetSessionResponse;
  sourcePresetId?: number | null;
  sourceServerConfigId?: string | null;
  completedSetIds: CompletedSetMap;
  plannedSetValues: Record<string, AssumedSetValues>;
  /** Live placeholder inputs; see buildPresetUpdateExercises. */
  assumeSources?: Omit<AssumedValueSources, 'plannedSetValues'>;
  /**
   * Called once there is nothing left to ask: no preset to compare, nothing
   * that needs updating, or the prompt was answered. For callers that keep the
   * check pending until then.
   */
  onSettled?: () => void;
  /**
   * Called once when the preset turns out to need updating, before the prompt
   * waits for the screen to be in front. Lets a caller ask somewhere else (the
   * watch) and apply the update itself if the answer is yes.
   */
  onNeedsUpdate?: (offer: PresetUpdateOffer) => void;
  /**
   * The question was already answered somewhere else (the watch), so the
   * phone does not ask it again. The caller applies the answer itself.
   */
  skipPrompt?: boolean;
}

export function useWorkoutCompletePresetSync({
  session,
  sourcePresetId,
  sourceServerConfigId,
  completedSetIds,
  plannedSetValues,
  assumeSources,
  onSettled,
  onNeedsUpdate,
  skipPrompt = false,
}: UseWorkoutCompletePresetSyncArgs) {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const isFocused = useIsFocused();
  // An alert raised while the app is in the background is lost, so the prompt
  // waits for the app to be in front (a watch finish resolves it while the
  // phone is locked).
  const [appActive, setAppActive] = useState(
    !isAppInBackground(AppState.currentState)
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) =>
      setAppActive(!isAppInBackground(state))
    );
    return () => sub.remove();
  }, []);
  const { updatePresetAsync } = useUpdateWorkoutPreset();
  const [sourcePreset, setSourcePreset] = useState<WorkoutPreset | null>(null);
  const promptedRef = useRef(false);
  const [promptNonce, setPromptNonce] = useState(0);
  const onSettledRef = useRef(onSettled);
  const onNeedsUpdateRef = useRef(onNeedsUpdate);
  useEffect(() => {
    onSettledRef.current = onSettled;
    onNeedsUpdateRef.current = onNeedsUpdate;
  });
  // Alert.alert cannot be dismissed from code: once the watch settles the
  // question, the phone's open alert must not act on a stale choice.
  const skipPromptRef = useRef(skipPrompt);
  useEffect(() => {
    skipPromptRef.current = skipPrompt;
  });
  const announcedRef = useRef(false);

  useEffect(() => {
    if (sourcePresetId == null) {
      onSettledRef.current?.();
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const config = await getActiveServerConfig();
        if (cancelled) return;
        if (config?.id !== sourceServerConfigId) {
          onSettledRef.current?.();
          return;
        }
        const preset = await getWorkoutPresetById(sourcePresetId);
        if (!cancelled) setSourcePreset(preset);
      } catch {
        // Deleted mid-workout (404) or unreachable — no prompt.
        if (!cancelled) onSettledRef.current?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourcePresetId, sourceServerConfigId]);

  const presetUpdateExercises = useMemo(
    () =>
      sourcePreset == null
        ? null
        : buildPresetUpdateExercises(session, sourcePreset, {
            completedSetIds,
            plannedSetValues,
            assumeSources,
            // Heavier or lighter than the preset is not worth a prompt.
            structureOnly: true,
          }),
    [sourcePreset, session, completedSetIds, plannedSetValues, assumeSources]
  );

  const applyUpdate = useCallback(async (): Promise<boolean> => {
    if (sourcePreset == null || presetUpdateExercises == null) return false;
    try {
      await updatePresetAsync({
        id: sourcePreset.id,
        payload: { exercises: presetUpdateExercises },
      });
      Toast.show({
        type: 'success',
        text1: t('workoutComplete.success.presetUpdated', {
          defaultValue: 'Preset updated',
        }),
      });
      return true;
    } catch {
      // useUpdateWorkoutPreset already showed the failure toast.
      return false;
    }
  }, [sourcePreset, presetUpdateExercises, updatePresetAsync, t]);

  useEffect(() => {
    if (announcedRef.current) return;
    if (sourcePreset == null || presetUpdateExercises == null) return;
    if (!sourcePreset.user_id || profile?.id !== sourcePreset.user_id) return;
    announcedRef.current = true;
    onNeedsUpdateRef.current?.({
      presetName: sourcePreset.name,
      update: applyUpdate,
    });
  }, [sourcePreset, presetUpdateExercises, profile?.id, applyUpdate]);

  useEffect(() => {
    if (promptedRef.current || !isFocused || !appActive) return;
    if (sourcePreset == null) return;
    if (presetUpdateExercises == null) {
      onSettledRef.current?.();
      return;
    }
    if (!sourcePreset.user_id) {
      onSettledRef.current?.();
      return;
    }
    if (profile?.id == null) return;
    if (profile.id !== sourcePreset.user_id) {
      onSettledRef.current?.();
      return;
    }
    if (skipPrompt) return;
    // The alert closed without settling (the watch took over, or the write
    // failed): allow the prompt again once nothing else holds it back.
    const rearmPrompt = () => {
      promptedRef.current = false;
      setPromptNonce((n) => n + 1);
    };
    const timer = setTimeout(() => {
      promptedRef.current = true;
      Alert.alert(
        t('workoutComplete.confirm.updatePresetTitle', {
          defaultValue: 'Update preset?',
        }),
        t('workoutComplete.confirm.updatePresetMessage', {
          defaultValue:
            'Today\'s workout differs from "{{preset}}". Update the preset to match?',
          preset: sourcePreset.name,
        }),
        [
          {
            text: t('workoutComplete.actions.keepPreset', {
              defaultValue: 'Keep Preset',
            }),
            style: 'cancel',
            onPress: () => {
              if (skipPromptRef.current) {
                rearmPrompt();
                return;
              }
              onSettledRef.current?.();
            },
          },
          {
            text: t('workoutComplete.actions.update', {
              defaultValue: 'Update',
            }),
            onPress: () => {
              if (skipPromptRef.current) {
                rearmPrompt();
                return;
              }
              void (async () => {
                if (await applyUpdate()) {
                  onSettledRef.current?.();
                  return;
                }
                // The alert is already gone. Ask again instead of dropping
                // the question because the write failed.
                rearmPrompt();
              })();
            },
          },
        ]
      );
    }, UPDATE_PRESET_PROMPT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    isFocused,
    appActive,
    sourcePreset,
    presetUpdateExercises,
    profile?.id,
    applyUpdate,
    skipPrompt,
    promptNonce,
    t,
  ]);
}
