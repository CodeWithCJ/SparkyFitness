import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FormDraft } from '../types/drafts';

const DRAFT_KEY = '@SessionDraft';

// TODO: handle multi server configs - just clear the draft when switching. or namespace
// if feeling fancy

export type { FormDraft } from '../types/drafts';

export async function loadDraft(): Promise<FormDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FormDraft;
  } catch {
    return null;
  }
}

export async function saveDraft(draft: FormDraft): Promise<void> {
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export async function clearDraft(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY);
}

/** Returns the draft if it has meaningful data, or null otherwise. */
export async function loadActiveDraft(): Promise<FormDraft | null> {
  const draft = await loadDraft();
  if (!draft) return null;
  if (draft.type === 'workout' && draft.exercises.length > 0) return draft;
  if (draft.type === 'activity' && draft.exerciseId != null) return draft;
  return null;
}
