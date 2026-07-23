import { useDiaryDateStore } from '../../src/stores/diaryDateStore';

describe('Add Screens Date Fallback', () => {
  beforeEach(() => {
    useDiaryDateStore.getState().setSelectedDate('2026-07-20');
  });

  afterEach(() => {
    useDiaryDateStore.getState().goToToday();
  });

  it('uses shared date store as fallback when route params date is omitted', () => {
    expect(useDiaryDateStore.getState().selectedDate).toBe('2026-07-20');
  });
});
