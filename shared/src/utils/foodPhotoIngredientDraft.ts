import {
  asPortionMacros,
  scalePortionMacros,
  sumPortionMacros,
  sumGrams,
} from "./foodPhotoEstimateMath.ts";
import type { EstimateMacros, PortionMacros } from "./foodPhotoEstimateMath.ts";
import type {
  FoodPhotoEstimateItem,
  FoodPhotoEstimateMatch,
} from "../schemas/api/FoodPhotoEstimate.api.zod.ts";

/**
 * Editing state for the detected-ingredient list on the photo review screen.
 *
 * Pure — no React. Both the mobile screen and the web dialog drive it through a
 * thin `useReducer` wrapper, so the editing rules (grams rescaling, the
 * manual-override latch, match application) exist once and behave identically
 * on both platforms.
 *
 * A reducer rather than `useState` over an array: every action has to keep
 * three things consistent (the grams, the six macros, and whether the row has
 * been hand-edited), and spreading that across the screen is how the
 * manual-override flag gets dropped. Totals are never stored — they are
 * derived, so they cannot drift from the rows.
 */

export interface IngredientDraftRow {
  /** Stable across edits. Server `item_id` when present, else a local id. */
  id: string;
  name: string;
  canonicalName: string;
  preparation: string;
  portionDescription: string;
  confidence: FoodPhotoEstimateItem['item_confidence'];
  assumptions: string[];

  grams: number;
  macros: PortionMacros;

  /** The AI's original values, kept so "revert" and match-toggle can restore. */
  aiGrams: number;
  aiMacros: PortionMacros;

  match?: FoodPhotoEstimateMatch | null;
  alternates: FoodPhotoEstimateMatch[];
  /** True while the row is showing the matched food's nutrition. */
  matchApplied: boolean;

  /**
   * Set once the user edits a macro directly. Grams edits then stop
   * rescaling this row: someone who corrects the protein and afterwards nudges
   * the weight must not silently lose the correction.
   */
  manualOverride: boolean;
}

export interface DraftState {
  rows: IngredientDraftRow[];
  expandedId: string | null;
}

export type IngredientDraftAction =
  | { type: 'SET_GRAMS'; id: string; grams: number }
  | { type: 'SET_MACRO'; id: string; key: keyof EstimateMacros; value: number }
  | { type: 'SET_NAME'; id: string; name: string }
  | { type: 'REMOVE_ROW'; id: string }
  | { type: 'APPLY_MATCH'; id: string; match?: FoodPhotoEstimateMatch }
  | { type: 'CLEAR_MATCH'; id: string }
  | { type: 'RECALC_FROM_GRAMS'; id: string }
  | { type: 'TOGGLE_EXPANDED'; id: string }
  | { type: 'RESET'; items: FoodPhotoEstimateItem[] };

function toRow(item: FoodPhotoEstimateItem, index: number): IngredientDraftRow {
  const macros = asPortionMacros(item);
  const grams =
    Number.isFinite(item.estimated_grams) && item.estimated_grams > 0
      ? item.estimated_grams
      : 0;
  return {
    // A server that predates item_id sends none; fall back to the index so
    // rows still get stable keys for this editing session.
    id: item.item_id ?? `local-${index}`,
    name: item.name,
    canonicalName: item.canonical_name ?? item.name,
    preparation: item.preparation ?? '',
    portionDescription: item.portion_description ?? '',
    confidence: item.item_confidence,
    assumptions: item.assumptions ?? [],
    grams,
    macros,
    aiGrams: grams,
    aiMacros: macros,
    match: item.match ?? null,
    alternates: item.alternates ?? [],
    // Applied on open only when the server says the match is strong enough.
    matchApplied: Boolean(item.preselect_match && item.match?.scaled),
    manualOverride: false,
  };
}

export function initialiseIngredientDraft(items: FoodPhotoEstimateItem[]): DraftState {
  const rows = items.map(toRow);
  return {
    rows: rows.map((row) =>
      row.matchApplied && row.match?.scaled
        ? { ...row, macros: asPortionMacros(row.match.scaled) }
        : row,
    ),
    expandedId: null,
  };
}

function mapRow(
  state: DraftState,
  id: string,
  update: (row: IngredientDraftRow) => IngredientDraftRow,
): DraftState {
  return {
    ...state,
    rows: state.rows.map((row) => (row.id === id ? update(row) : row)),
  };
}

export function ingredientDraftReducer(
  state: DraftState,
  action: IngredientDraftAction,
): DraftState {
  switch (action.type) {
    case 'SET_GRAMS':
      return mapRow(state, action.id, (row) => {
        const grams = Number.isFinite(action.grams) && action.grams >= 0 ? action.grams : 0;
        // A hand-edited row keeps its numbers; only the weight moves.
        if (row.manualOverride) return { ...row, grams };
        // A row showing a matched food rescales from that food's nutrition,
        // not from the AI's, so the DB values stay authoritative.
        const base = row.matchApplied && row.match?.scaled
          ? { macros: asPortionMacros(row.match.scaled), grams: row.aiGrams }
          : { macros: row.aiMacros, grams: row.aiGrams };
        const rescaled = scalePortionMacros(base.macros, base.grams, grams);
        return rescaled ? { ...row, grams, macros: rescaled } : { ...row, grams };
      });

    case 'SET_MACRO':
      return mapRow(state, action.id, (row) => ({
        ...row,
        manualOverride: true,
        macros: asPortionMacros({
          ...row.macros,
          [action.key]:
            Number.isFinite(action.value) && action.value >= 0 ? action.value : 0,
        }),
      }));

    case 'SET_NAME':
      return mapRow(state, action.id, (row) => ({ ...row, name: action.name }));

    case 'REMOVE_ROW':
      return {
        ...state,
        rows: state.rows.filter((row) => row.id !== action.id),
        expandedId: state.expandedId === action.id ? null : state.expandedId,
      };

    case 'APPLY_MATCH':
      return mapRow(state, action.id, (row) => {
        const match = action.match ?? row.match;
        // A variant measured in cups or slices has no gram-scaled nutrition,
        // so there is nothing to apply.
        if (!match?.scaled) return row;
        return {
          ...row,
          match,
          matchApplied: true,
          manualOverride: false,
          name: match.food_name,
          macros: asPortionMacros(match.scaled),
        };
      });

    case 'CLEAR_MATCH':
      return mapRow(state, action.id, (row) => {
        if (!row.matchApplied) return row;
        const restored = scalePortionMacros(row.aiMacros, row.aiGrams, row.grams);
        return {
          ...row,
          matchApplied: false,
          manualOverride: false,
          macros: restored ?? row.aiMacros,
        };
      });

    case 'RECALC_FROM_GRAMS':
      return mapRow(state, action.id, (row) => {
        const base = row.matchApplied && row.match?.scaled
          ? asPortionMacros(row.match.scaled)
          : row.aiMacros;
        const rescaled = scalePortionMacros(base, row.aiGrams, row.grams);
        return rescaled
          ? { ...row, manualOverride: false, macros: rescaled }
          : { ...row, manualOverride: false };
      });

    case 'TOGGLE_EXPANDED':
      // One row open at a time keeps the on-screen input count manageable.
      return {
        ...state,
        expandedId: state.expandedId === action.id ? null : action.id,
      };

    case 'RESET':
      return initialiseIngredientDraft(action.items);

    default:
      return state;
  }
}


/** Derived totals for a set of draft rows. Never stored — always recomputed. */
export function ingredientDraftTotals(rows: IngredientDraftRow[]) {
  return {
    totals: sumPortionMacros(rows),
    totalGrams: sumGrams(rows.map((row) => ({ estimated_grams: row.grams }))),
    matchedCount: rows.filter((row) => row.matchApplied).length,
  };
}
