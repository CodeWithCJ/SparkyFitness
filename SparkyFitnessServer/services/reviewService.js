const foodRepository = require('../models/foodRepository');
const exerciseRepository = require('../models/exerciseRepository');

async function getNeedsReviewItems(userId) {
  const foodsNeedingReview = await foodRepository.getFoodsNeedingReview(userId);
  const exercisesNeedingReview = await exerciseRepository.getExercisesNeedingReview(userId);

  const reviewItems = [];

  foodsNeedingReview.forEach(food => {
    reviewItems.push({
      id: food.id,
      type: 'food',
      name: food.food_name,
      // Add other relevant food details if needed
    });
  });

  exercisesNeedingReview.forEach(exercise => {
    reviewItems.push({
      id: exercise.id,
      type: 'exercise',
      name: exercise.name,
      // Add other relevant exercise details if needed
    });
  });

  return reviewItems;
}

/**
 * Counts the number of shared items that need review by the current user.
 * An item needs review if it has been updated by its owner after the current user's last known version.
 * @param {number} userId The ID of the user for whom to count items needing review.
 * @returns {Promise<number>} The total count of items needing review.
 */
async function getNeedsReviewCount(userId) {
  const foodsNeedingReview = await foodRepository.getFoodsNeedingReview(userId);
  const exercisesNeedingReview = await exerciseRepository.getExercisesNeedingReview(userId);

  return foodsNeedingReview.length + exercisesNeedingReview.length;
}

module.exports = {
  getNeedsReviewCount,
  getNeedsReviewItems,
};