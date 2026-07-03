import foodDb from './food.js';
import foodVariantDb from './foodVariant.js';
import foodEntryDb from './foodEntry.js';
import foodTemplateDb from './foodTemplate.js';
import foodMiscDb from './foodMisc.js';
export const getFoodOwnerId = foodDb.getFoodOwnerId;
export const getFoodsNeedingReview = foodDb.getFoodsNeedingReview;
export const clearUserIgnoredUpdate = foodDb.clearUserIgnoredUpdate;
export const getFoodEntryById = foodEntryDb.getFoodEntryById;
export const deleteFoodAndDependencies = foodDb.deleteFoodAndDependencies;
export default {
  ...foodDb,
  ...foodVariantDb,
  ...foodEntryDb,
  ...foodTemplateDb,
  ...foodMiscDb,
  getFoodOwnerId,
  getFoodsNeedingReview,
  clearUserIgnoredUpdate,
  getFoodEntryById,
  deleteFoodAndDependencies,
};
