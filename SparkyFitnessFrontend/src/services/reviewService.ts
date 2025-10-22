import { api } from '@/services/api'; // Assuming you have a utility for making API requests

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
  try {
    const response = await api.get(`/review/needs-review`);
    return response as ReviewItem[];
  } catch (error) {
    console.error('Failed to fetch needs review items:', error);
    return [];
  }
};

export const getNeedsReviewCount = async (): Promise<number> => {
  try {
    const response = await api.get(`/review/needs-review-count`);
    return (response as { count: number }).count;
  } catch (error) {
    console.error('Failed to fetch needs review count:', error);
    return 0;
  }
};