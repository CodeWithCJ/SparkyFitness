import { api } from '@/api/api';

/**
 * Fetches the total number of items (foods, exercises, meals)
 * that are shared and have been updated by the owner, requiring the current user's review.
 * @returns A promise that resolves to the number of items needing review.
 */
export interface ReviewItem {
  id: string;
  type: 'food' | 'exercise' | 'meal';
  name: string;
  // Add any other relevant fields for displaying the review item
}

export const getNeedsReviewItems = async (): Promise<ReviewItem[]> => {
  const response = await api.get(`/review/needs-review`);
  return response as ReviewItem[];
};

export const getNeedsReviewCount = async (): Promise<number> => {
  const response = await api.get(`/review/needs-review-count`);
  return (response as { count: number }).count;
};
