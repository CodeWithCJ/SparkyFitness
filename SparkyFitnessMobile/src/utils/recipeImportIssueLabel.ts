import type { TFunction } from 'i18next';

export function recipeImportIssueLabel(issue: string, t: TFunction): string {
  switch (issue) {
    case 'missing_servings':
      return t('recipeImport.missingServings', {
        defaultValue:
          'The source has no recipe servings. Enter servings to save for tracking; nutrition sync remains unavailable.',
      });
    case 'missing_quantity':
      return t('recipeImport.issues.missing_quantity', {
        defaultValue:
          'Source quantity is missing. Enter the whole-recipe amount.',
      });
    case 'missing_unit':
      return t('recipeImport.issues.missing_unit', {
        defaultValue:
          'Source unit is missing. Select an explicit compatible unit.',
      });
    case 'unstructured_food':
      return t('recipeImport.issues.unstructured_food', {
        defaultValue: 'Source food identity needs manual review.',
      });
    case 'linked_recipe':
      return t('recipeImport.issues.linked_recipe', {
        defaultValue:
          'Linked recipes cannot be imported here. Use a recipe with explicit ingredients.',
      });
    case 'mapping_unavailable':
      return t('recipeImport.issues.mapping_unavailable', {
        defaultValue:
          'The saved food mapping is unavailable. Choose a food again.',
      });
    case 'incomplete_nutrition':
      return t('recipeImport.issues.incomplete_nutrition', {
        defaultValue:
          'Some optional nutrients are unknown. Known nutrition can still be used.',
      });
    case 'incompatible_unit':
      return t('recipeImport.issues.incompatible_unit', {
        defaultValue:
          'Review the quantity in the selected food unit. Volume is never treated as mass.',
      });
    default:
      return t('recipeImport.sourceWarning', {
        defaultValue: 'Review the source recipe before syncing nutrition.',
      });
  }
}
