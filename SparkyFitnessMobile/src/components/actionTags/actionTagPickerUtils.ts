import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { formatLocalizedNumber } from '../../localization';

export type ScanOverride =
  | { drinks_override: number }
  | { water_ml_override: number }
  | { quantity_override: number };

export type ScanConfirmOptions = {
  override?: ScanOverride;
  mealTypeId?: string;
  entryTime?: string;
};

export const MULTIPLIER_PRESETS = [0.5, 1, 1.5, 2] as const;
export const WATER_ML_PRESETS = [250, 500, 750] as const;
export const WATER_DRINK_PRESETS = [1, 2, 3] as const;

const LAST_AMOUNT_KEY_PREFIX = '@SparkyFitness/action-tag-last-amount:';

export type LastUsedAmount = {
  value: number;
  unit: string;
};

export function formatInputNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)));
}

export function formatDisplayNumber(
  value: number,
  maximumFractionDigits = 2
): string {
  return formatLocalizedNumber(value, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
}

export function normalizeHhMm(raw: string): string | undefined {
  const trimmed = raw.trim();
  const amPmMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed);
  if (amPmMatch) {
    const rawHours = Number(amPmMatch[1]);
    const minutes = Number(amPmMatch[2]);
    const period = amPmMatch[3].toUpperCase();
    if (rawHours < 1 || rawHours > 12 || minutes < 0 || minutes > 59) {
      return undefined;
    }
    let hours = rawHours % 12;
    if (period === 'PM') {
      hours += 12;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function triggerScanHaptic(style: 'light' | 'medium' = 'light'): void {
  try {
    const level =
      style === 'medium'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
    void Haptics.impactAsync(level);
  } catch {
    // Haptics module unavailable -> ignore silently
  }
}

export async function loadLastUsedAmount(
  tagId: string
): Promise<LastUsedAmount | null> {
  try {
    const raw = await AsyncStorage.getItem(`${LAST_AMOUNT_KEY_PREFIX}${tagId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastUsedAmount>;
    if (
      typeof parsed.value === 'number' &&
      Number.isFinite(parsed.value) &&
      parsed.value > 0 &&
      typeof parsed.unit === 'string' &&
      parsed.unit.length > 0
    ) {
      return { value: parsed.value, unit: parsed.unit };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveLastUsedAmount(
  tagId: string,
  entry: LastUsedAmount
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${LAST_AMOUNT_KEY_PREFIX}${tagId}`,
      JSON.stringify(entry)
    );
  } catch {
    // Treat storage errors as non-blocking
  }
}

export function formatCurrentTimeHhMm(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function parseContainerMl(volume: unknown): number {
  const num = Number(volume);
  if (!Number.isFinite(num) || num <= 0) return 250;
  return num;
}
