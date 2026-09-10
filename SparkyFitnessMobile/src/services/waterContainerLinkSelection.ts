// #2115: hand-off for FoodSearchScreen/FoodEntryAddScreen's 'container-link'
// picker mode, mirroring the pending-selection pattern in
// mealPlanSelection.ts. WaterContainerEditScreen consumes this on focus
// after the picker pops back to it.

export interface PendingContainerLinkSelection {
  foodId: string;
  variantId: string;
  foodName: string;
  /** Quantity chosen on the add screen, in the picked variant's own unit. */
  quantity: number;
}

let pendingSelection: PendingContainerLinkSelection | null = null;

export function setPendingContainerLinkSelection(
  selection: PendingContainerLinkSelection
) {
  pendingSelection = selection;
}

export function consumePendingContainerLinkSelection() {
  const selection = pendingSelection;
  pendingSelection = null;
  return selection;
}
