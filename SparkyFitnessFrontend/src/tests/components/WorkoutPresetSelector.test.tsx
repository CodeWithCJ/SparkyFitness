import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPresetSelector from '@/pages/Exercises/WorkoutPresetSelector';
import type { WorkoutPreset } from '@/types/workout';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string,
      options?: Record<string, string | number>
    ) => {
      const translations: Record<string, string> = {
        'exercise.workoutPresetSelector.searchPlaceholder':
          'ابحث في قوالب التمرين…',
        'exercise.workoutPresetSelector.searchLabel': 'البحث في قوالب التمرين',
        'exercise.workoutPresetSelector.recentPresetsTitle': 'أحدث القوالب',
        'exercise.workoutPresetSelector.noRecentPresets':
          'ما عندك قوالب تمرين للحين.',
        'exercise.workoutPresetSelector.searchResultsTitle': 'نتائج البحث',
        'exercise.workoutPresetSelector.noMatchingPresets':
          'ما لقينا قالبًا يطابق بحثك.',
        'exercise.workoutPresetSelector.exerciseCount': '{{count}} تمرين',
        'exercise.workoutPresetSelector.templateBadge': 'قالب تمرين',
        'exercise.workoutPresetSelector.selectTemplate':
          'اختيار قالب {{templateName}}',
      };
      const template = translations[key] ?? defaultValue ?? key;
      return Object.entries(options ?? {}).reduce(
        (value, [name, replacement]) =>
          value.replaceAll(`{{${name}}}`, String(replacement)),
        template
      );
    },
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const mockPreset = {
  id: 'preset-1',
  user_id: 'user-1',
  name: 'تمرين صباحي',
  description: 'بداية خفيفة لليوم',
  exercises: [{ exercise_id: 'exercise-1', exercise_name: 'مشي' }],
} as WorkoutPreset;

jest.mock('@/hooks/Exercises/useWorkoutPresets', () => ({
  useWorkoutPresets: () => ({
    data: { pages: [{ presets: [mockPreset] }] },
  }),
}));

describe('WorkoutPresetSelector', () => {
  it('renders an accessible RTL workout-template choice', () => {
    const onPresetSelected = jest.fn();
    const { container } = render(
      <WorkoutPresetSelector onPresetSelected={onPresetSelected} />
    );

    expect(screen.getByLabelText('البحث في قوالب التمرين')).toHaveAttribute(
      'placeholder',
      'ابحث في قوالب التمرين…'
    );
    expect(screen.getByText('أحدث القوالب')).toBeInTheDocument();
    expect(screen.getByText('1 تمرين')).toBeInTheDocument();
    expect(screen.getByText('قالب تمرين')).toBeInTheDocument();
    expect(screen.queryByText('قوالب إضافية')).not.toBeInTheDocument();
    expect(container.querySelector('.start-4')).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'اختيار قالب تمرين صباحي' })
    );
    expect(onPresetSelected).toHaveBeenCalledWith(mockPreset);
  });
});
