// The one definition of the food search dialog's size and scroll behaviour,
// shared by the Foods page dialog (FoodSearchDialog) and the Diary meal dialog
// (MealCard). A flex column capped to 90% of the usable height: on tall windows
// the results area inside FoodSearch shrinks and scrolls; on short ones (below
// 37.5rem, see FoodSearch) nothing shrinks and the dialog itself scrolls, so
// there is only ever one scrollbar.
// Below 768px wide, the unlayered .dialog-viewport-fit rule in src/index.css
// (max-height: calc(100dvh - 2rem)) still wins over this class.
export const FOOD_SEARCH_DIALOG_CONTENT_CLASS =
  'max-w-6xl max-h-[90dvh] flex flex-col overflow-y-auto';
