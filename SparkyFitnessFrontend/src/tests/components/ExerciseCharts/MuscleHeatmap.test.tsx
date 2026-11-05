import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MuscleHeatmap } from '@/components/ExerciseCharts/MuscleHeatmap';
import { useBodyMapSvgQuery } from '@/hooks/Exercises/useExercises';
import { useProfileQuery } from '@/hooks/Settings/useProfile';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
}));
let mockActiveUserId = 'user-1';
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: mockActiveUserId }),
}));
jest.mock('@/hooks/Settings/useProfile', () => ({
  useProfileQuery: jest.fn(),
}));
jest.mock('@/hooks/Exercises/useExercises', () => ({
  useBodyMapSvgQuery: jest.fn(),
}));

const mockProfile = useProfileQuery as jest.Mock;
const mockSvg = useBodyMapSvgQuery as jest.Mock;

const SVG = (figure: string) =>
  `<svg viewBox="0 0 10 10" data-figure="${figure}"><path class="chest" d="M0 0h5v5z"/></svg>`;

describe('MuscleHeatmap', () => {
  beforeEach(() => {
    mockActiveUserId = 'user-1';
    mockSvg.mockImplementation((figure: string) => ({ data: SVG(figure) }));
  });

  it('starts on the figure for the stored gender', () => {
    mockProfile.mockReturnValue({ data: { gender: 'female' } });
    const { container } = render(<MuscleHeatmap setsByMuscle={{ Chest: 4 }} />);
    expect(mockSvg).toHaveBeenLastCalledWith('female');
    expect(container.querySelector('svg[data-figure="female"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Female' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('switches figures without writing the profile', () => {
    mockProfile.mockReturnValue({ data: { gender: null } });
    render(<MuscleHeatmap setsByMuscle={{ Chest: 4 }} />);
    expect(mockSvg).toHaveBeenLastCalledWith('male');

    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    expect(mockSvg).toHaveBeenLastCalledWith('female');
    expect(screen.getByRole('button', { name: 'Male' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('drops the previous figure while the next one loads', () => {
    mockProfile.mockReturnValue({ data: { gender: null } });
    mockSvg.mockImplementation((figure: string) => ({
      data: figure === 'male' ? SVG('male') : undefined,
    }));
    const { container } = render(<MuscleHeatmap setsByMuscle={{ Chest: 4 }} />);
    expect(container.querySelector('svg[data-figure="male"]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    expect(container.querySelector('svg[data-figure]')).toBeNull();
  });

  it("starts on the viewed family member's figure, not the signed-in user's", () => {
    mockActiveUserId = 'family-member';
    mockProfile.mockImplementation((userId?: string) => ({
      data: { gender: userId === 'family-member' ? 'female' : 'male' },
    }));
    render(<MuscleHeatmap setsByMuscle={{ Chest: 4 }} />);
    expect(mockProfile).toHaveBeenLastCalledWith('family-member');
    expect(mockSvg).toHaveBeenLastCalledWith('female');
  });

  it('flips the colours in the untrained view', () => {
    mockProfile.mockReturnValue({ data: { gender: null } });
    mockSvg.mockReturnValue({
      data: '<svg viewBox="0 0 10 10"><path class="chest" d="M0 0h5v5z"/><path class="quads" d="M5 5h5v5z"/></svg>',
    });
    const { container } = render(<MuscleHeatmap setsByMuscle={{ Chest: 4 }} />);
    const chest = () => container.querySelector('path[data-muscle="chest"]');
    const quads = () => container.querySelectorAll('path')[1];
    expect(chest()).toHaveClass('heat-4');
    expect(quads()).toHaveClass('heat-0');

    fireEvent.click(screen.getByRole('button', { name: 'Untrained' }));
    expect(chest()).toHaveClass('heat-0');
    expect(quads()).toHaveClass('heat-4');
  });
});
