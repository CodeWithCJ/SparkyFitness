// #941: hand-off for the food search's 'action-tag' picker mode, mirroring
// waterContainerLinkSelection.ts. ActionTagFormScreen consumes it on focus
// after the picker pops back to it.

/** A food or saved meal picked for an NFC tag, with what one tap logs. */
export type PendingActionTagSelection =
  | {
      kind: 'food';
      foodId: string;
      variantId: string;
      name: string;
      /** In the picked variant's own unit. */
      quantity: number;
      unit: string;
    }
  | {
      kind: 'meal';
      mealId: string;
      name: string;
      /** In the meal's own unit: servings, or grams for a gram-based meal. */
      quantity: number;
      unit: string;
    };

let pendingSelection: PendingActionTagSelection | null = null;

export function setPendingActionTagSelection(
  selection: PendingActionTagSelection
) {
  pendingSelection = selection;
}

export function consumePendingActionTagSelection() {
  const selection = pendingSelection;
  pendingSelection = null;
  return selection;
}
