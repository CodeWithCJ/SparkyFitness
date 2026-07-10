import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPlaybackSummary from '@/pages/Diary/WorkoutPlaybackSummary';
import type {
  WorkoutPlaybackDraft,
  WorkoutPlaybackStats,
} from '@/utils/workoutPlayback';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string,
      options?: Record<string, string | number>
    ) => {
      const translations: Record<string, string> = {
        'common.back': 'رجوع',
        'exercise.workoutPlaybackDialog.closeKeepDraft': 'إغلاق وحفظ التقدم',
        'exercise.workoutPlaybackDialog.discard': 'حذف التقدم',
        'exercise.workoutPlaybackDialog.finish': 'إنهاء التمرين',
        'exercise.workoutPlaybackDialog.finishing': 'جارٍ حفظ التمرين…',
        'exercise.workoutPlaybackPage.description':
          'سجّل مجموعاتك وتابع الراحة، واحفظ تمرينك يوم تخلص.',
        'exercise.workoutPlaybackPage.elapsedTime': 'المدة',
        'exercise.workoutPlaybackPage.volume': 'حجم التمرين',
        'exercise.workoutPlaybackPage.volumeValue': '{{value}} {{unit}}',
        'exercise.workoutPlaybackPage.progress': 'المجموعات',
        'exercise.workoutPlaybackPage.restTimer': 'الراحة',
        'exercise.workoutPlaybackPage.pauseRest': 'إيقاف الراحة مؤقتًا',
        'exercise.workoutPlaybackPage.resumeRest': 'متابعة الراحة',
        'exercise.workoutPlaybackPage.skipRest': 'تخطي الراحة',
        'exercise.logExerciseEntryDialog.sessionNotes': 'ملاحظات التمرين',
        'exercise.logExerciseEntryDialog.notesPlaceholder':
          'اكتب ملاحظاتك عن هالتمرين…',
        'units.pound': 'رطل',
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

const draft = {
  name: 'تمرين الجزء العلوي',
  notes: '',
  rest_timer: {
    state: 'running',
    duration_seconds: 90,
    remaining_seconds: 45,
  },
} as WorkoutPlaybackDraft;

const stats = {
  completedSets: 1,
  totalSets: 3,
} as WorkoutPlaybackStats;

describe('WorkoutPlaybackSummary', () => {
  it('renders Saudi Arabic controls and a converted localized volume', () => {
    const onPauseResumeRest = jest.fn();
    const onSkipRest = jest.fn();

    render(
      <WorkoutPlaybackSummary
        draft={draft}
        elapsedSeconds={65}
        totalVolume={100}
        weightUnit="lbs"
        stats={stats}
        restRemaining="0:45"
        isRestActive
        saveError={null}
        isSaving={false}
        onCloseKeepDraft={jest.fn()}
        onDiscard={jest.fn()}
        onFinishWorkout={jest.fn()}
        onPauseResumeRest={onPauseResumeRest}
        onSkipRest={onSkipRest}
        onSessionNotesChange={jest.fn()}
      />
    );

    expect(screen.getByText('220.5 رطل')).toBeInTheDocument();
    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(screen.getByLabelText('ملاحظات التمرين')).toHaveAttribute(
      'placeholder',
      'اكتب ملاحظاتك عن هالتمرين…'
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'إيقاف الراحة مؤقتًا' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'تخطي الراحة' }));
    expect(onPauseResumeRest).toHaveBeenCalledTimes(1);
    expect(onSkipRest).toHaveBeenCalledTimes(1);

    const backButton = screen.getByRole('button', { name: 'رجوع' });
    expect(backButton.querySelector('svg')).toHaveClass('rtl:rotate-180');
  });
});
