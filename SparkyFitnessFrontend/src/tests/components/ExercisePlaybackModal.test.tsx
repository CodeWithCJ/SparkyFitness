import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExercisePlaybackModal from '@/pages/Diary/ExercisePlaybackModal';
import type { Exercise } from '@/types/exercises';
import {
  installSpeechSynthesisMock,
  removeSpeechSynthesisMock,
  type SpeechSynthesisMock,
} from '@/tests/mocks/speechSynthesisMock';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/hooks/Exercises/useExerciseVideoUrl', () => ({
  useExerciseVideoUrl: () => null,
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ loggingLevel: 'SILENT' }),
}));

const exercise = {
  id: 'ex-1',
  name: 'Push-up',
  description: 'A classic',
  instructions: ['Keep your core firm.', 'Lower slowly.'],
  images: [],
} as unknown as Exercise;

// Locks in the narration the modal had before its speech code moved into
// utils/speechNarrator (#1507): same voice default, language, rate and mute.
describe('ExercisePlaybackModal narration', () => {
  let synth: SpeechSynthesisMock;

  beforeEach(() => {
    synth = installSpeechSynthesisMock([
      { voiceURI: 'gb', name: 'Daniel', lang: 'en-GB' },
      { voiceURI: 'us-f', name: 'Samantha Female', lang: 'en-US' },
    ]);
  });

  afterEach(() => removeSpeechSynthesisMock());

  it('reads the first instruction with the default en-US voice on open', () => {
    render(
      <ExercisePlaybackModal isOpen onClose={jest.fn()} exercise={exercise} />
    );
    const last = synth.spoken.at(-1);
    expect(last?.text).toBe('Keep your core firm.');
    expect(last?.voice?.voiceURI).toBe('us-f');
    expect(last).toMatchObject({ lang: 'en-US', rate: 1, pitch: 1 });
  });

  it('moves to the next instruction when one finishes', () => {
    render(
      <ExercisePlaybackModal isOpen onClose={jest.fn()} exercise={exercise} />
    );
    const first = synth.spoken.at(-1);
    // The engine finishes the utterance.
    act(() => first?.onend?.(new Event('end') as SpeechSynthesisEvent));
    expect(synth.spoken.at(-1)?.text).toBe('Lower slowly.');
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
  });

  it('cancels speech and stops speaking while muted', () => {
    render(
      <ExercisePlaybackModal isOpen onClose={jest.fn()} exercise={exercise} />
    );
    const muteButton = document
      .querySelector('.lucide-volume-2')
      ?.closest('button') as HTMLButtonElement;
    const spokenBefore = synth.speak.mock.calls.length;
    synth.cancel.mockClear();
    fireEvent.click(muteButton);
    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.speak.mock.calls.length).toBe(spokenBefore);
  });

  it('cancels speech when closed', () => {
    const { rerender } = render(
      <ExercisePlaybackModal isOpen onClose={jest.fn()} exercise={exercise} />
    );
    synth.cancel.mockClear();
    rerender(
      <ExercisePlaybackModal
        isOpen={false}
        onClose={jest.fn()}
        exercise={exercise}
      />
    );
    expect(synth.cancel).toHaveBeenCalled();
  });
});
