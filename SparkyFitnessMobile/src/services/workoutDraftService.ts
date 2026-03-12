import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorkoutDraft } from '../hooks/useWorkoutForm';

const SESSION_DRAFT_KEY = '@SessionDraft';

// TODO: handle multi server configs - just clear the draft when switching. or namespace
// if feeling fancy

export type SessionDraft = WorkoutDraft; // | ActivityDraft (future)

export async function loadSessionDraft(): Promise<SessionDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionDraft;
  } catch {
    return null;
  }
}

export async function saveSessionDraft(draft: SessionDraft): Promise<void> {
  await AsyncStorage.setItem(SESSION_DRAFT_KEY, JSON.stringify(draft));
}

export async function clearSessionDraft(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_DRAFT_KEY);
}
