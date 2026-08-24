export interface FamilyDiaryUser {
  userId: string;
  displayName: string;
  email: string | null;
  canCopy: boolean;
  accessEndDate: string | null;
}

export interface CopyReviewedFoodEntriesFromUserPayload {
  familyUserId: string;
  sourceDate: string;
  sourceMealType: string;
  targetDate: string;
  targetMealType: string;
  entries: { entryId: string; sourceFingerprint: string }[];
}

export interface CopySelectedFoodEntriesFromUserPayload {
  familyUserId: string;
  sourceDate: string;
  targetDate: string;
  targetMealType: string;
  entries: {
    entryId: string;
    quantity: number;
    sourceFingerprint: string;
  }[];
}
