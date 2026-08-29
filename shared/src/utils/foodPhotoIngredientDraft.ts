import {
  asPortionMacros,
  scalePortionMacros,
  sumPortionMacros,
  sumGrams,
  ESTIMATE_MACRO_KEYS,
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
  /** The AI's original name, kept so clearing a match can restore it. */
  aiName: string;

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

  /**
   * Present only on a row the user added from the food picker rather than one
   * the model detected. Such a food is logged verbatim by id at the amount and
   * unit that were picked — a food measured in cups, slices or servings has no
   * gram weight to convert, so these rows bypass the grams -> per-100 g bridge
   * that detected rows go through.
   */
  logAs?: PickedFoodReference;
}

/** Identifies the database food an added row logs against. */
export interface PickedFoodReference {
  foodId: string;
  variantId: string;
  quantity: number;
  unit: string;
}

/** A row before the reducer assigns it an id. */
export type NewIngredientDraftRow = Omit<IngredientDraftRow, 'id'>;

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
  | { type: 'ADD_ROW'; row: NewIngredientDraftRow }
  | { type: 'RESET'; items: FoodPhotoEstimateItem[] };

/**
 * Whether a match's scaled nutrition says anything at all.
 *
 * A match can carry an all-zero `scaled` — the matched food itself has no
 * nutrition recorded. Applying that silently replaces the model's numbers with
 * zeros, and if the row is then logged and saved as a food, the next photo
 * matches THAT and the zeros spread. Treat it as no nutrition instead: keep
 * the model's estimate and leave the match as a suggestion the user can still
 * read.
 *
 * Exported because the server has to make the same judgement one step earlier,
 * when it decides whether to preselect a match at all.
 */
export function hasUsableMacros(
  scaled: EstimateMacros | null | undefined,
): boolean {
  if (!scaled) return false;
  return ESTIMATE_MACRO_KEYS.some((key) => {
    const value = scaled[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  });
}

/** A match that can actually be applied: it exists and has real nutrition. */
function applicableMatch(
  match: FoodPhotoEstimateMatch | null | undefined,
): FoodPhotoEstimateMatch | null {
  return match && hasUsableMacros(match.scaled) ? match : null;
}

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
    aiName: item.name,
    match: item.match ?? null,
    alternates: item.alternates ?? [],
    // Applied on open only when the server says the match is strong enough.
    matchApplied: Boolean(
      item.preselect_match && applicableMatch(item.match)
    ),
    manualOverride: false,
  };
}

export interface PickedFoodRowInput {
  foodId: string;
  variantId: string;
  /** Display name of the picked food. */
  name: string;
  /** How much of it the user is adding, in `unit`. */
  quantity: number;
  unit: string;
  /** The variant's serving size, which `macrosPerServing` describes. */
  servingSize: number;
  macrosPerServing: Partial<EstimateMacros>;
}

const ADDED_ROW_ID_PREFIX = 'added-';

/**
 * Builds a draft row from a food the user picked out of the food search.
 *
 * The nutrition comes from a real database food, so the row is logged against
 * that food by id (`logAs`) rather than being recreated as a quick food from
 * gram-scaled numbers. `grams` is filled in only when the picked unit is grams:
 * cups, slices and servings have no mass, and inventing one would understate or
 * overstate the plate's weight everywhere it is summed.
 */
export function ingredientRowFromPickedFood(
  input: PickedFoodRowInput,
): NewIngredientDraftRow {
  const quantity =
    Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 0;
  const servingSize =
    Number.isFinite(input.servingSize) && input.servingSize > 0
      ? input.servingSize
      : 0;
  const scale = servingSize > 0 ? quantity / servingSize : 0;
  const perServing = asPortionMacros(input.macrosPerServing);
  const macros = asPortionMacros({
    calories_kcal: perServing.calories_kcal * scale,
    protein_g: perServing.protein_g * scale,
    carbs_g: perServing.carbs_g * scale,
    fat_g: perServing.fat_g * scale,
    fiber_g: perServing.fiber_g * scale,
    sugar_g: perServing.sugar_g * scale,
  });
  const grams = input.unit.trim().toLowerCase() === 'g' ? quantity : 0;
  const name = input.name.trim();
  return {
    name,
    canonicalName: name,
    preparation: '',
    portionDescription: `${quantity} ${input.unit}`,
    // Not the model's guess at all — it is a food the user chose.
    confidence: 'high',
    assumptions: [],
    grams,
    macros,
    aiGrams: grams,
    aiMacros: macros,
    aiName: name,
    match: null,
    alternates: [],
    // `matchApplied` means "showing a detected item's database match". This row
    // has no detected item behind it, and flagging it would make it count
    // towards the matched-ingredient tally the review screens display.
    matchApplied: false,
    // Its numbers came from a real variant, so a grams nudge must not rescale
    // them out from under the amount that will actually be logged.
    manualOverride: true,
    logAs: {
      foodId: input.foodId,
      variantId: input.variantId,
      quantity,
      unit: input.unit,
    },
  };
}

/** First `added-N` id not already taken, so ids stay unique and stable. */
function nextAddedRowId(rows: IngredientDraftRow[]): string {
  let highest = 0;
  for (const row of rows) {
    if (!row.id.startsWith(ADDED_ROW_ID_PREFIX)) continue;
    const parsed = Number(row.id.slice(ADDED_ROW_ID_PREFIX.length));
    if (Number.isInteger(parsed) && parsed > highest) highest = parsed;
  }
  return `${ADDED_ROW_ID_PREFIX}${highest + 1}`;
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
        // Detach the match. A row still flagged `matchApplied` serializes as
        // `source: 'existing'`, and the server then snapshots the matched
        // variant from the database — silently throwing this edit away.
        // The match itself is kept so the row can re-apply it.
        matchApplied: false,
        macros: asPortionMacros({
          ...row.macros,
          [action.key]:
            Number.isFinite(action.value) && action.value >= 0 ? action.value : 0,
        }),
      }));

    case 'SET_NAME':
      // Renaming detaches for the same reason: an `existing` row is logged
      // under the database food's name, not the typed one.
      return mapRow(state, action.id, (row) => ({
        ...row,
        name: action.name,
        matchApplied: false,
      }));

    case 'REMOVE_ROW':
      return {
        ...state,
        rows: state.rows.filter((row) => row.id !== action.id),
        expandedId: state.expandedId === action.id ? null : state.expandedId,
      };

    case 'APPLY_MATCH':
      return mapRow(state, action.id, (row) => {
        const match = applicableMatch(action.match ?? row.match);
        // A variant measured in cups or slices has no gram-scaled nutrition,
        // and one whose scaled nutrition is all zeros has nothing worth
        // applying — in both cases there is nothing to swap in.
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
          // Without this the row keeps the rejected match's name and is logged
          // as a new quick food named after the food the user just declined.
          name: row.aiName,
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

    case 'ADD_ROW':
      // Appended, not inserted: the detected rows keep the order the model
      // returned them in, and what the user added reads as a later addition.
      return {
        ...state,
        rows: [...state.rows, { ...action.row, id: nextAddedRowId(state.rows) }],
      };

    case 'RESET':
      return initialiseIngredientDraft(action.items);

    default:
      return state;
  }
}


/**
 * Whether a new `items` prop should reset the draft.
 *
 * Identity alone is not enough. A caller writing `estimate?.items ?? []`
 * produces a fresh array on every render before the estimate arrives, and
 * resetting on that sets state during render forever — React aborts the tree
 * with "Too many re-renders". Two empty lists are therefore the same estimate.
 *
 * Shared so the web dialog and the mobile review screen cannot drift on it;
 * both wrap it in the same three-line `useState` guard.
 */
export function shouldResetIngredientDraft(
  items: readonly FoodPhotoEstimateItem[],
  seenItems: readonly FoodPhotoEstimateItem[],
): boolean {
  if (items === seenItems) return false;
  return !(items.length === 0 && seenItems.length === 0);
}

/**
 * True once the user has actually changed the detected ingredients.
 *
 * This matters for the "One food" view. The model's `totals` is its own figure
 * for the whole plate and can legitimately exceed the sum of the itemised rows
 * (oil, sauces and seasoning it accounted for without listing). So an untouched
 * draft must keep using `estimate.totals`, and only a real edit — a removed
 * row, a changed weight or name, a hand-edited macro, an applied match — should
 * make the row sum authoritative instead.
 */
export function isIngredientDraftEdited(
  rows: IngredientDraftRow[],
  originalCount: number
): boolean {
  if (rows.length !== originalCount) return true;
  return rows.some(
    (row) =>
      // A picked food is not something the model reported, so a draft holding
      // one is edited even if it replaced a row one-for-one.
      row.logAs !== undefined ||
      row.manualOverride ||
      row.matchApplied ||
      row.name !== row.aiName ||
      row.grams !== row.aiGrams
  );
}

/**
 * Derived totals for a set of draft rows. Never stored — always recomputed.
 *
 * `totalGrams` counts only rows that have a gram weight. A picked food measured
 * in cups or servings contributes macros but no mass, so callers that need a
 * trustworthy plate weight (the "One food" path, a per-serving gram hint)
 * should check `hasCompleteGrams` rather than assume the sum is the whole plate.
 */
export function ingredientDraftTotals(rows: IngredientDraftRow[]) {
  return {
    totals: sumPortionMacros(rows),
    totalGrams: sumGrams(rows.map((row) => ({ estimated_grams: row.grams }))),
    matchedCount: rows.filter((row) => row.matchApplied).length,
    hasCompleteGrams: rows.length > 0 && rows.every((row) => row.grams > 0),
  };
}
