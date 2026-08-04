import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';
import { getErrorMessage } from '../utils/errors';

const backfillKeyForConfig = (configId: string): string => `@Backfill:state:${configId}`;

export interface BackfillCheckpoint {
  version: 1;
  status: 'in-progress' | 'done';
  /** ISO instants, local-midnight-aligned at write time. Covered span is [cursor, endEdge). */
  endEdge: string;
  cursor: string;
  floor: string;
  /** Keyed by recordType (dedupes duplicate cross-platform metric ids). null = probe found no data. */
  earliestByRecordType: Record<string, string | null>;
  /** FROZEN at first run. Resume always uses this set; changing toggles requires Start Over. */
  enabledRecordTypes: string[];
  recordsUploaded: number;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export const loadBackfillCheckpoint = async (configId: string): Promise<BackfillCheckpoint | null> => {
  try {
    const raw = await AsyncStorage.getItem(backfillKeyForConfig(configId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackfillCheckpoint;
    if (parsed?.version !== 1 || typeof parsed.cursor !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveBackfillCheckpoint = async (
  configId: string,
  checkpoint: BackfillCheckpoint,
): Promise<void> => {
  try {
    await AsyncStorage.setItem(backfillKeyForConfig(configId), JSON.stringify(checkpoint));
  } catch (error) {
    addLog(`[Backfill] Failed to save checkpoint: ${getErrorMessage(error)}`, 'ERROR');
  }
};

export const clearBackfillCheckpoint = async (configId: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(backfillKeyForConfig(configId));
  } catch (error) {
    addLog(`[Backfill] Failed to clear checkpoint: ${getErrorMessage(error)}`, 'ERROR');
  }
};
