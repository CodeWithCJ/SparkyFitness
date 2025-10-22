const foodDb = require('./food');
const foodVariantDb = require('./foodVariant');
const foodEntryDb = require('./foodEntry');
const foodTemplateDb = require('./foodTemplate');
const foodMiscDb = require('./foodMisc');

module.exports = {
  ...foodDb,
  ...foodVariantDb,
  ...foodEntryDb,
  ...foodTemplateDb,
  ...foodMiscDb,
  getFoodOwnerId: foodDb.getFoodOwnerId,
  getFoodsNeedingReview: foodDb.getFoodsNeedingReview,
  updateFoodEntriesSnapshot: foodDb.updateFoodEntriesSnapshot,
  clearUserIgnoredUpdate: foodDb.clearUserIgnoredUpdate,
  getFoodEntryById: foodEntryDb.getFoodEntryById,
  deleteFoodAndDependencies: foodDb.deleteFoodAndDependencies,
};
