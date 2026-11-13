export interface FamilyDiaryUser {
  userId: string;
  displayName: string;
  email: string | null;
  canCopy: boolean;
  accessEndDate: string | null;
}

export type FamilyCopyDirection = 'from-family' | 'to-family';

export interface FamilyCopySource {
  sourceDate: string;
  mealTypeId: string | null;
  mealTypeName: string;
}

export type {
  CopyReviewedFoodEntriesFromUserPayload,
  CopySelectedFoodEntriesFromUserPayload,
} from '@workspace/shared';
