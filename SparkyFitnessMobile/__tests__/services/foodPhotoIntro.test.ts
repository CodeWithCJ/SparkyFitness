import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  hasSeenFoodPhotoIntro,
  markFoodPhotoIntroSeen,
} from '../../src/services/foodPhotoIntro';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('foodPhotoIntro', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  test('hasSeenFoodPhotoIntro returns false before mark', async () => {
    await expect(hasSeenFoodPhotoIntro()).resolves.toBe(false);
  });

  test('markFoodPhotoIntroSeen persists, hasSeen returns true', async () => {
    await markFoodPhotoIntroSeen();
    await expect(hasSeenFoodPhotoIntro()).resolves.toBe(true);
  });

  test('storage key matches namespaced format', async () => {
    await markFoodPhotoIntroSeen();
    await expect(AsyncStorage.getItem('@FoodPhoto:hasSeenIntro')).resolves.toBe(
      'true',
    );
  });
});
