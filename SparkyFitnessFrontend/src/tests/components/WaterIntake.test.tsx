import { screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import WaterIntake from '@/pages/Diary/WaterIntake';
import { useWaterContainer } from '@/contexts/WaterContainerContext';
import {
  useWaterIntakeQuery,
  useUpdateWaterIntakeMutation,
} from '@/hooks/Diary/useWaterIntake';
import { renderWithClient } from '../test-utils';

// Mock hooks and contexts
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: any) => {
      if (
        key === 'foodDiary.waterIntake.perDrink' ||
        key === 'foodDiary.waterIntake.defaultPerDrink'
      ) {
        return `${options.volume} ${options.unit}`;
      }
      if (key === 'foodDiary.waterIntake.title') {
        return 'Water Intake';
      }
      return key;
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ water_display_unit: 'ml' }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'user-1' }),
}));

jest.mock('@/contexts/WaterContainerContext', () => ({
  useWaterContainer: jest.fn(),
}));

jest.mock('@/hooks/Diary/useWaterIntake', () => ({
  useWaterGoalQuery: jest.fn().mockReturnValue({ data: 2000 }),
  useWaterIntakeQuery: jest.fn().mockReturnValue({ data: 500 }),
  useUpdateWaterIntakeMutation: jest.fn(),
}));

// Mock icons
jest.mock('lucide-react', () => ({
  Droplet: () => <div data-testid="droplet-icon" />,
  ChevronLeft: () => <div data-testid="chevron-left" />,
  ChevronRight: () => <div data-testid="chevron-right" />,
  Star: () => <div data-testid="star-icon" />,
  Plus: () => <div data-testid="plus-icon" />,
  Minus: () => <div data-testid="minus-icon" />,
}));

const mockContainers = [
  {
    id: 1,
    name: 'Work Bottle',
    volume: 500,
    unit: 'ml',
    servings_per_container: 1,
    is_primary: true,
  },
  {
    id: 2,
    name: 'Home Glass',
    volume: 250,
    unit: 'ml',
    servings_per_container: 1,
    is_primary: false,
  },
];

describe('WaterIntake Component', () => {
  const mockMutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useWaterIntakeQuery as jest.Mock).mockReturnValue({ data: 500 });
    (useWaterContainer as jest.Mock).mockReturnValue({
      activeContainer: mockContainers[0],
      containers: mockContainers,
    });
    (useUpdateWaterIntakeMutation as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  it('renders the initial active container and its volume in the intuitive control row', () => {
    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    expect(screen.getByText(/WORK BOTTLE/i)).toBeInTheDocument();
    // The volume should be between the plus/minus buttons
    expect(screen.getByText('500 ml')).toBeInTheDocument();
    // Primary container should have a star
    expect(screen.getByTestId('star-icon')).toBeInTheDocument();
  });

  it('cycles to the next container and updates the volume display', () => {
    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    const nextButton = screen.getByTestId('chevron-right').parentElement;
    fireEvent.click(nextButton!);

    expect(screen.getByText(/HOME GLASS/i)).toBeInTheDocument();
    expect(screen.getByText('250 ml')).toBeInTheDocument();
    // Non-primary container should NOT have a star
    expect(screen.queryByTestId('star-icon')).not.toBeInTheDocument();
  });

  it('calls update mutation with the toggled container ID when clicking the Plus icon button', () => {
    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    const nextButton = screen.getByTestId('chevron-right').parentElement;
    fireEvent.click(nextButton!); // Switch to Home Glass (ID: 2, 250ml)

    const plusButton = screen.getByTestId('plus-icon').parentElement;
    fireEvent.click(plusButton!);

    expect(mockMutate).toHaveBeenCalledWith({
      user_id: 'user-1',
      entry_date: '2023-10-27',
      change_drinks: 1,
      container_id: 2, // Home Glass
    });
  });

  it('disables the minus button when intake is 0', () => {
    // Override the mock to simulate zero water intake for this test
    (useWaterIntakeQuery as jest.Mock).mockReturnValue({ data: 0 });

    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    const minusButton = screen.getByTestId('minus-icon').parentElement;
    expect(minusButton).toBeDisabled();
  });
});
