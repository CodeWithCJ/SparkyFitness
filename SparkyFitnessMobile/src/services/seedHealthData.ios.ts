// iOS stub - seeding not implemented for HealthKit
// HealthKit has easy manual entry in the Health app

interface SeedResult {
  success: boolean;
  recordsInserted: number;
  error?: string;
}

export const seedHealthData = async (_days: number = 7): Promise<SeedResult> => {
  return {
    success: false,
    recordsInserted: 0,
    error: 'Seeding is only available on Android. On iOS, use the Health app to add test data manually.',
  };
};
