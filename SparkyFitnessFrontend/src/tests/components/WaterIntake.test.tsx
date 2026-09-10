import { screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import WaterIntake from '@/pages/Diary/WaterIntake';
import { useWaterContainer } from '@/contexts/WaterContainerContext';
import {
  useWaterIntakeQuery,
  useManualWaterIntakeQuery,
  useFoodWaterIntakeQuery,
  useWaterIntakeLogQuery,
  useUpdateWaterIntakeMutation,
} from '@/hooks/Diary/useWaterIntake';
import { renderWithClient } from '../test-utils';

// Mock hooks and contexts
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      if (
        key === 'foodDiary.waterIntake.perDrink' ||
        key === 'foodDiary.waterIntake.defaultPerDrink'
      ) {
        return `${options?.['volume']} ${options?.['unit']}`;
      }
      if (key === 'foodDiary.waterIntake.title') {
        return 'Water Intake';
      }
      if (key === 'foodDiary.waterIntake.fromFood') {
        return `Includes ${options?.['volume']} ${options?.['unit']} from food`;
      }
      if (key === 'drink_presets.quickAdd') {
        return 'Quick-Add Drinks';
      }
      return key;
    },
    i18n: {
      language: 'en',
      changeLanguage: jest.fn(),
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ water_display_unit: 'ml', timezone: 'UTC' }),
}));

jest.mock('@workspace/shared', () => ({
  instantHourMinute: () => ({ hour: 12, minute: 0 }),
  dayToUtcRange: () => ({
    start: new Date('2023-10-27T00:00:00Z'),
    end: new Date('2023-10-28T00:00:00Z'),
  }),
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
  useManualWaterIntakeQuery: jest.fn().mockReturnValue({ data: 500 }),
  useFoodWaterIntakeQuery: jest.fn().mockReturnValue({ data: 0 }),
  useUpdateWaterIntakeMutation: jest.fn(),
  useWaterIntakeLogQuery: jest.fn().mockReturnValue({ data: [] }),
  useDeleteWaterIntakeLogMutation: jest.fn().mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
  }),
  useUpdateWaterIntakeLogTimeMutation: jest.fn().mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
  }),
}));

// Mock icons
jest.mock('lucide-react', () => ({
  Droplet: () => <div data-testid="droplet-icon" />,
  ChevronLeft: () => <div data-testid="chevron-left" />,
  ChevronRight: () => <div data-testid="chevron-right" />,
  ChevronDown: () => <div data-testid="chevron-down" />,
  ChevronUp: () => <div data-testid="chevron-up" />,
  Star: () => <div data-testid="star-icon" />,
  Plus: () => <div data-testid="plus-icon" />,
  Minus: () => <div data-testid="minus-icon" />,
  Trash2: () => <div data-testid="trash-icon" />,
  Utensils: () => <div data-testid="utensils-icon" />,
}));

const mockStandardContainers = [
  {
    id: 1,
    name: 'Work Bottle',
    volume: 500,
    unit: 'ml' as const,
    servings_per_container: 1,
    is_primary: true,
    is_quick_add: false,
  },
  {
    id: 2,
    name: 'Home Glass',
    volume: 250,
    unit: 'ml' as const,
    servings_per_container: 1,
    is_primary: false,
    is_quick_add: false,
  },
];

const mockQuickAddPresets = [
  {
    id: 10,
    name: 'Espresso',
    volume: 30,
    unit: 'ml' as const,
    servings_per_container: 1,
    is_primary: false,
    is_quick_add: true,
    hydration_factor: 0,
    sort_order: 0,
  },
  {
    id: 11,
    name: 'Beer (Pint 4.5%)',
    volume: 568,
    unit: 'ml' as const,
    servings_per_container: 1,
    is_primary: false,
    is_quick_add: true,
    hydration_factor: 0.7,
    sort_order: 1,
  },
];

const allMockContainers = [...mockStandardContainers, ...mockQuickAddPresets];

describe('WaterIntake Component', () => {
  const mockMutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useWaterIntakeQuery as jest.Mock).mockReturnValue({ data: 500 });
    (useManualWaterIntakeQuery as jest.Mock).mockReturnValue({ data: 500 });
    (useFoodWaterIntakeQuery as jest.Mock).mockReturnValue({ data: 0 });
    (useWaterContainer as jest.Mock).mockReturnValue({
      activeContainer: mockStandardContainers[0],
      containers: allMockContainers,
      standardContainers: mockStandardContainers,
      quickAddPresets: mockQuickAddPresets,
    });
    (useUpdateWaterIntakeMutation as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  it('renders the initial active container and its volume in the intuitive control row', () => {
    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    expect(screen.getByText(/WORK BOTTLE/i)).toBeInTheDocument();
    expect(screen.getByText('500 ml')).toBeInTheDocument();
    expect(screen.getByTestId('star-icon')).toBeInTheDocument();
  });

  it('cycles only across standard containers and excludes quick-add presets from carousel', () => {
    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    const nextButton = screen.getByTestId('chevron-right').parentElement;
    fireEvent.click(nextButton!);

    // Should cycle to Home Glass, not Espresso
    expect(screen.getByText(/HOME GLASS/i)).toBeInTheDocument();
    expect(screen.getByText('250 ml')).toBeInTheDocument();

    // Cycling again wraps back to Work Bottle
    fireEvent.click(nextButton!);
    expect(screen.getByText(/WORK BOTTLE/i)).toBeInTheDocument();
  });

  it('renders quick-add drink preset tiles below controls', () => {
    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    expect(screen.getByText('Quick-Add Drinks')).toBeInTheDocument();
    expect(screen.getByText('Espresso')).toBeInTheDocument();
    expect(screen.getByText('Beer (Pint 4.5%)')).toBeInTheDocument();
    expect(screen.getByText('0% water')).toBeInTheDocument();
  });

  it('calls update mutation with preset container ID when tapping a quick-add tile', () => {
    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    const espressoButton = screen.getByText('Espresso').closest('button');
    expect(espressoButton).toBeInTheDocument();
    fireEvent.click(espressoButton!);

    expect(mockMutate).toHaveBeenCalledWith({
      user_id: 'user-1',
      entry_date: '2023-10-27',
      change_drinks: 1,
      container_id: 10,
    });
  });

  it('disables the minus button when intake is 0', () => {
    (useWaterIntakeQuery as jest.Mock).mockReturnValue({ data: 0 });
    (useManualWaterIntakeQuery as jest.Mock).mockReturnValue({ data: 0 });

    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    const minusButton = screen.getByTestId('minus-icon').parentElement;
    expect(minusButton).toBeDisabled();
  });

  it('disables the minus button when the day has only provider-synced water', () => {
    (useWaterIntakeQuery as jest.Mock).mockReturnValue({ data: 1000 });
    (useManualWaterIntakeQuery as jest.Mock).mockReturnValue({ data: 0 });

    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    const minusButton = screen.getByTestId('minus-icon').parentElement;
    expect(minusButton).toBeDisabled();
  });

  it('keeps the minus button enabled when some of the day was logged manually', () => {
    (useWaterIntakeQuery as jest.Mock).mockReturnValue({ data: 1000 });
    (useManualWaterIntakeQuery as jest.Mock).mockReturnValue({ data: 250 });

    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    const minusButton = screen.getByTestId('minus-icon').parentElement;
    expect(minusButton).not.toBeDisabled();
  });

  it('labels provider-synced drinks in the log but leaves manual ones unlabelled', () => {
    (useWaterIntakeLogQuery as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'e1',
          water_ml: 250,
          container_name: 'Work Bottle',
          source: 'manual',
          logged_at: '2023-10-27T09:00:00.000Z',
          created_at: '2023-10-27T09:00:00.000Z',
        },
        {
          id: 'e2',
          water_ml: 500,
          container_name: 'Work Bottle',
          source: 'health_connect',
          logged_at: '2023-10-27T10:00:00.000Z',
          created_at: '2023-10-27T10:00:00.000Z',
        },
      ],
    });

    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    expect(screen.getByText('Health Connect')).toBeInTheDocument();
    expect(screen.queryByText('manual')).not.toBeInTheDocument();
  });

  it('renders a delete button only on manually logged drink rows', () => {
    (useWaterIntakeLogQuery as jest.Mock).mockReturnValue({
      data: [
        {
          id: 'e1',
          water_ml: 250,
          container_name: 'Work Bottle',
          source: 'manual',
          logged_at: '2023-10-27T09:00:00.000Z',
          created_at: '2023-10-27T09:00:00.000Z',
        },
        {
          id: 'e2',
          water_ml: 500,
          container_name: 'Work Bottle',
          source: 'health_connect',
          logged_at: '2023-10-27T10:00:00.000Z',
          created_at: '2023-10-27T10:00:00.000Z',
        },
      ],
    });

    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    expect(screen.getAllByTestId('trash-icon')).toHaveLength(1);
  });

  it('shows the food-derived water line when food water is present', () => {
    (useFoodWaterIntakeQuery as jest.Mock).mockReturnValue({ data: 300 });

    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    expect(screen.getByText('Includes 300 ml from food')).toBeInTheDocument();
  });

  it('hides the food-derived water line when the user has not opted in', () => {
    (useFoodWaterIntakeQuery as jest.Mock).mockReturnValue({ data: 0 });

    renderWithClient(<WaterIntake selectedDate="2023-10-27" />);

    expect(screen.queryByText(/from food/i)).not.toBeInTheDocument();
  });
});
