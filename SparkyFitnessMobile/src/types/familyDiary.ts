export interface FamilyDiaryUser {
  userId: string;
  displayName: string;
  email: string | null;
  canCopy: boolean;
  accessEndDate: string | null;
}


export type {
  CopyReviewedFoodEntriesFromUserPayload,
  CopySelectedFoodEntriesFromUserPayload,
} from '@workspace/shared';
