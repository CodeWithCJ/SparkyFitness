import { getToolDisplay, isLookupTool, CHAT_SUGGESTIONS } from '../../src/constants/chat';

describe('getToolDisplay', () => {
  it('maps the high-traffic logging tools to friendly labels + icons', () => {
    expect(getToolDisplay('sparky_manage_food')).toEqual({
      label: 'تسجيل الطعام',
      icon: 'food',
    });
    expect(getToolDisplay('sparky_manage_exercise')).toEqual({
      label: 'تسجيل التمارين',
      icon: 'exercise',
    });
    expect(getToolDisplay('sparky_manage_checkin')).toEqual({
      label: 'تسجيل القياسات',
      icon: 'measurements',
    });
    expect(getToolDisplay('sparky_manage_goals')).toEqual({
      label: 'إدارة الأهداف',
      icon: 'flame',
    });
  });

  it('labels known lookup tools in Arabic with the search icon', () => {
    expect(getToolDisplay('sparky_get_food_diary')).toEqual({
      label: 'الاطلاع على يوميات الطعام',
      icon: 'search',
    });
    expect(getToolDisplay('sparky_get_exercise_progress')).toEqual({
      label: 'الاطلاع على تقدم التمارين',
      icon: 'search',
    });
    expect(getToolDisplay('sparky_get_nutritional_summary')).toEqual({
      label: 'الاطلاع على ملخص التغذية',
      icon: 'search',
    });
  });

  it('localizes known searches and hides unknown technical identifiers', () => {
    expect(getToolDisplay('sparky_search_foods')).toEqual({
      label: 'البحث عن أصناف غذائية',
      icon: 'search',
    });
    expect(getToolDisplay('some_random_tool')).toEqual({
      label: 'أداة سباركي',
      icon: 'wrench',
    });
  });
});

describe('isLookupTool', () => {
  it('is true for sparky_get_* lookup tools', () => {
    expect(isLookupTool('sparky_get_food_diary')).toBe(true);
    expect(isLookupTool('sparky_get_nutritional_summary')).toBe(true);
  });

  it('is false for manage/other tools', () => {
    expect(isLookupTool('sparky_manage_food')).toBe(false);
    expect(isLookupTool('some_random_tool')).toBe(false);
    // Keyed on the `sparky_get_` prefix, not the word "search".
    expect(isLookupTool('sparky_search_foods')).toBe(false);
  });
});

describe('CHAT_SUGGESTIONS', () => {
  it('provides non-empty Saudi Arabic starter prompts', () => {
    expect(CHAT_SUGGESTIONS.length).toBeGreaterThan(0);
    expect(CHAT_SUGGESTIONS).toContain('سجّل بيضتين وموزة على الفطور');
    expect(CHAT_SUGGESTIONS).toContain('كم باقي لي من السعرات اليوم؟');
    CHAT_SUGGESTIONS.forEach((suggestion) => {
      expect(suggestion.trim().length).toBeGreaterThan(0);
    });
  });
});
