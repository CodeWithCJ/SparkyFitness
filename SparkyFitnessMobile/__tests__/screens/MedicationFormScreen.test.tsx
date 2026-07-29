import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { pressAction } from './helpers/nativeHeaderTestUtils';
import MedicationFormScreen from '../../src/screens/MedicationFormScreen';
import {
  useMedicationDetail,
  useCreateMedication,
  useUpdateMedication,
} from '../../src/hooks/useMedications';
import type { MedicationDetail } from '@workspace/shared';

jest.mock('../../src/hooks/useMedications', () => ({
  useMedicationDetail: jest.fn(),
  useCreateMedication: jest.fn(),
  useUpdateMedication: jest.fn(),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ options, onSelect, value }: any) => (
      <View>
        <Text>{options.find((option: any) => option.value === value)?.label ?? ''}</Text>
        {options.map((option: any) => (
          <Pressable key={option.value} onPress={() => onSelect(option.value)}>
            <Text>{`opt-${option.value}`}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  dispatch: jest.fn(),
  navigate: jest.fn(),
} as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockUseMedicationDetail = useMedicationDetail as jest.MockedFunction<
  typeof useMedicationDetail
>;
const mockUseCreateMedication = useCreateMedication as jest.MockedFunction<
  typeof useCreateMedication
>;
const mockUseUpdateMedication = useUpdateMedication as jest.MockedFunction<
  typeof useUpdateMedication
>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const baseMed: MedicationDetail = {
  id: 'med-1',
  user_id: 'user-1',
  name: 'Lisinopril',
  display_name: null,
  type_id: 'pill',
  route_id: null,
  strength_value: 10,
  strength_unit: 'mg',
  dose_amount: 1,
  dose_unit: 'tablet',
  reason_text: 'Hypertension',
  effectiveness_rating: null,
  color: null,
  icon: null,
  photo_path: null,
  is_active: true,
  is_quick: false,
  is_glp1: false,
  notes: 'Take with food',
  source: 'manual',
  prescriber: 'Dr. Smith',
  pharmacy: 'Corner Pharmacy',
  custom_fields: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schedules: [],
};

const renderScreen = (medicationId?: string) => {
  const route = {
    key: 'MedicationForm-key',
    name: 'MedicationForm' as const,
    params: medicationId ? { medicationId } : undefined,
  };
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <MedicationFormScreen navigation={mockNavigation} route={route as any} />
    </SafeAreaProvider>,
  );
};

describe('MedicationFormScreen — optional text fields', () => {
  const createMutate = jest.fn();
  const updateMutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMedicationDetail.mockReturnValue({ data: baseMed } as any);
    mockUseCreateMedication.mockReturnValue({ mutate: createMutate, isPending: false } as any);
    mockUseUpdateMedication.mockReturnValue({ mutate: updateMutate, isPending: false } as any);
  });

  it('sends explicit null for cleared fields so the server clears them', () => {
    const screen = renderScreen('med-1');

    fireEvent.changeText(screen.getByPlaceholderText('Blood pressure'), '');
    fireEvent.changeText(screen.getByPlaceholderText('Dr. Ipsum'), '');
    fireEvent.changeText(screen.getByPlaceholderText('Sunny Pharmacy'), '');
    fireEvent.changeText(screen.getByDisplayValue('Take with food'), '');

    pressAction(screen, mockNavigation, 'Save');

    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: 'med-1',
        body: expect.objectContaining({
          reason_text: null,
          prescriber: null,
          pharmacy: null,
          notes: null,
        }),
      },
      expect.anything(),
    );
  });

  it('treats whitespace-only input as cleared', () => {
    const screen = renderScreen('med-1');

    fireEvent.changeText(screen.getByPlaceholderText('Blood pressure'), '   ');

    pressAction(screen, mockNavigation, 'Save');

    expect(updateMutate).toHaveBeenCalledWith(
      { id: 'med-1', body: expect.objectContaining({ reason_text: null }) },
      expect.anything(),
    );
  });

  it('passes through non-empty values trimmed', () => {
    const screen = renderScreen('med-1');

    fireEvent.changeText(screen.getByPlaceholderText('Blood pressure'), '  Migraines  ');

    pressAction(screen, mockNavigation, 'Save');

    expect(updateMutate).toHaveBeenCalledWith(
      {
        id: 'med-1',
        body: expect.objectContaining({
          reason_text: 'Migraines',
          prescriber: 'Dr. Smith',
          pharmacy: 'Corner Pharmacy',
          notes: 'Take with food',
        }),
      },
      expect.anything(),
    );
  });

  it('sends null for empty optional fields on create', () => {
    mockUseMedicationDetail.mockReturnValue({ data: undefined } as any);
    const screen = renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('Lisinopril'), 'Metformin');

    pressAction(screen, mockNavigation, 'Save');

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Metformin',
        reason_text: null,
        prescriber: null,
        pharmacy: null,
        notes: null,
      }),
      expect.anything(),
    );
  });
});
