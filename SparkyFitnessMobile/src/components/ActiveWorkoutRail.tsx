import { useMemo } from 'react';
import { useCSSVariable } from 'uniwind';
import {
  SUPERSET_PALETTE_VARS,
  buildSupersetColorMap,
  getSupersetRuns,
  type SupersetRun,
} from '../utils/workoutSession';

export interface SupersetBorder {
  color: string;
  /** Last member of its run — the shared bar stops at this thumb. */
  isLast: boolean;
}

/**
 * Superset presentation shared by every workout surface: adjacent 2+ runs and
 * the per-member rail/bar descriptor in a per-group theme palette color. Pass
 * session entries directly; the form list passes its drafts mapped to
 * `{ id: clientId, superset_group: supersetGroup }`.
 */
export function useSupersetBorders(
  exercises: { id: string; superset_group?: number | null }[],
  paletteVars: readonly string[] = SUPERSET_PALETTE_VARS
): { runs: SupersetRun[]; borders: Map<string, SupersetBorder> } {
  const palette = useCSSVariable(paletteVars as string[]) as string[];
  const runs = useMemo(() => getSupersetRuns(exercises), [exercises]);
  const borders = useMemo(() => {
    const colorByEntryId = buildSupersetColorMap(runs, palette);
    const map = new Map<string, SupersetBorder>();
    for (const run of runs) {
      run.entryIds.forEach((entryId, index) => {
        const color = colorByEntryId.get(entryId);
        if (color != null) {
          map.set(entryId, {
            color,
            isLast: index === run.entryIds.length - 1,
          });
        }
      });
    }
    return map;
  }, [runs, palette]);
  return { runs, borders };
}
