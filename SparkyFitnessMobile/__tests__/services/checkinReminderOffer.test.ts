import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  hasShownCheckinReminderOffer,
  markCheckinReminderOfferShown,
} from '../../src/services/checkinReminderOffer';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('checkinReminderOffer', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  test('is not shown before it is marked', async () => {
    await expect(hasShownCheckinReminderOffer()).resolves.toBe(false);
  });

  test('marking persists under the namespaced key', async () => {
    await markCheckinReminderOfferShown();
    await expect(hasShownCheckinReminderOffer()).resolves.toBe(true);
    await expect(
      AsyncStorage.getItem('@SparkyFitness/checkinReminderOfferShown')
    ).resolves.toBe('true');
  });

  test('a read failure counts as shown so we never nag', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('x'));
    await expect(hasShownCheckinReminderOffer()).resolves.toBe(true);
  });
});
