import foodRepository from '../models/foodRepository.js';
import exerciseRepository from '../models/exerciseRepository.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getNeedsReviewItems(userId: any) {
  const foodsNeedingReview = await foodRepository.getFoodsNeedingReview(userId);
  const exercisesNeedingReview =
    await exerciseRepository.getExercisesNeedingReview(userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reviewItems: any = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foodsNeedingReview.forEach((food: any) => {
    reviewItems.push({
      id: food.id,
      type: 'food',
      name: food.food_name,
      // Add other relevant food details if needed
    });
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exercisesNeedingReview.forEach((exercise: any) => {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getNeedsReviewCount(userId: any) {
  const foodsNeedingReview = await foodRepository.getFoodsNeedingReview(userId);
  const exercisesNeedingReview =
    await exerciseRepository.getExercisesNeedingReview(userId);
  return foodsNeedingReview.length + exercisesNeedingReview.length;
}
export { getNeedsReviewCount };
export { getNeedsReviewItems };
export default {
  getNeedsReviewCount,
  getNeedsReviewItems,
};
