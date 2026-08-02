import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CycleTodayView from '../../../src/components/wellness/CycleTodayView';

const mockUpsertLogAsync = jest.fn().mockResolvedValue({});
const mockUpsertBbt = jest.fn().mockResolvedValue({});
const mockUpsertCheckInAsync = jest.fn().mockResolvedValue({});
const mockCreateEntryAsync = jest.fn().mockResolvedValue({});
const mockDeleteEntryAsync = jest.fn().mockResolvedValue(undefined);
let mockMode = 'ttc';
let mockMeasurements: { weight: number } | null = null;
let mockSymptomEntries: Record<string, unknown>[] = [];
const mockLog: Record<string, unknown> = {
  cervical_mucus: 'creamy',
  cervical_position: 'high',
};

// Each option becomes its own pressable so a test can target
// "<picker title>:<option label>" without depending on sheet internals.
jest.mock('../../../src/components/BottomSheetPicker', () => {
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      title,
      options,
      onSelect,
    }: {
      title: string;
      options: { value: string; label: string }[];
      onSelect: (value: string) => void;
    }) => (
      <View>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            accessibilityLabel={`${title}:${opt.label}`}
            onPress={() => onSelect(opt.value)}
          >
            <Text>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    ),
  };
});

jest.mock('../../../src/components/wellness/CycleIcon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="cycle-icon" /> };
});

// Renders one pressable per selected/known symptom so tests can toggle draft
// selection without depending on chip internals.
jest.mock('../../../src/components/wellness/CycleSymptomPicker', () => {
  const { Text, TouchableOpacity, View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      selected,
      onToggle,
    }: {
      selected: string[];
      onToggle: (symptom: { displayName: string }) => void;
    }) => (
      <View testID="symptom-picker">
        {['Nausea', 'Fatigue'].map((name) => (
          <TouchableOpacity
            key={name}
            accessibilityLabel={`toggle-symptom:${name}`}
            onPress={() => onToggle({ displayName: name })}
          >
            <Text>{selected.includes(name) ? `${name}:on` : `${name}:off`}</Text>
          </TouchableOpacity>
        ))}
      </View>
    ),
  };
});

jest.mock('../../../src/hooks/useSymptoms', () => ({
  useSymptomEntries: () => ({ entries: mockSymptomEntries, isLoading: false }),
  useSymptomMutations: () => ({
    createEntryAsync: mockCreateEntryAsync,
    deleteEntryAsync: mockDeleteEntryAsync,
  }),
}));

jest.mock('../../../src/hooks/useCycleLogs', () => ({
  useCycleLog: () => ({ log: mockLog, isLoading: false, refetch: jest.fn() }),
}));

jest.mock('../../../src/hooks/useUpsertCycleLog', () => ({
  useUpsertCycleLog: () => ({
    upsertLogAsync: mockUpsertLogAsync,
    isSaving: false,
  }),
}));

jest.mock('../../../src/hooks/useCycleMode', () => ({
  useCycleMode: () => ({ mode: mockMode }),
}));

jest.mock('../../../src/hooks/useMeasurements', () => ({
  useMeasurements: () => ({ measurements: mockMeasurements, isLoading: false }),
}));

jest.mock('../../../src/hooks/useUpsertCheckIn', () => ({
  useUpsertCheckIn: () => ({ mutateAsync: mockUpsertCheckInAsync, isPending: false }),
}));

jest.mock('../../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_weight_unit: 'kg' } }),
}));

jest.mock('../../../src/services/api/cycleApi', () => ({
  upsertBbt: (...args: unknown[]) => mockUpsertBbt(...args),
}));

describe('CycleTodayView optional pickers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends null when Cervical Mucus is set back to None', async () => {
    const { getByLabelText, getByText } = render(<CycleTodayView date="2026-08-01" />);

    fireEvent.press(getByLabelText('Select Cervical Mucus:None'));
    fireEvent.press(getByText('Save Log Entry'));

    await waitFor(() => expect(mockUpsertLogAsync).toHaveBeenCalled());
    expect(mockUpsertLogAsync.mock.calls[0][0].body).toMatchObject({
      cervical_mucus: null,
      cervical_position: 'high',
    });
  });

  it('sends null when Cervical Position is set back to None', async () => {
    const { getByLabelText, getByText } = render(<CycleTodayView date="2026-08-01" />);

    fireEvent.press(getByLabelText('Select Cervical Position:None'));
    fireEvent.press(getByText('Save Log Entry'));

    await waitFor(() => expect(mockUpsertLogAsync).toHaveBeenCalled());
    expect(mockUpsertLogAsync.mock.calls[0][0].body).toMatchObject({
      cervical_mucus: 'creamy',
      cervical_position: null,
    });
  });

  it('writes nothing when the BBT input is invalid', async () => {
    const { getByPlaceholderText, getByText } = render(<CycleTodayView date="2026-08-01" />);

    fireEvent.changeText(getByPlaceholderText('e.g. 36.5'), 'abc');
    fireEvent.press(getByText('Save Log Entry'));

    await waitFor(() => expect(mockUpsertLogAsync).not.toHaveBeenCalled());
    expect(mockUpsertBbt).not.toHaveBeenCalled();
  });

  it('keeps a real selection instead of clearing it', async () => {
    const { getByLabelText, getByText } = render(<CycleTodayView date="2026-08-01" />);

    fireEvent.press(getByLabelText('Select Cervical Mucus:Watery'));
    fireEvent.press(getByText('Save Log Entry'));

    await waitFor(() => expect(mockUpsertLogAsync).toHaveBeenCalled());
    expect(mockUpsertLogAsync.mock.calls[0][0].body).toMatchObject({
      cervical_mucus: 'watery',
    });
  });
});

describe('CycleTodayView pregnant mode weight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMode = 'pregnant';
    mockMeasurements = null;
  });

  afterAll(() => {
    mockMode = 'ttc';
    mockMeasurements = null;
  });

  it('saves an entered weight through the check-in mutation on Save', async () => {
    const { getByPlaceholderText, getByText } = render(<CycleTodayView date="2026-08-01" />);

    fireEvent.changeText(getByPlaceholderText('e.g. 65'), '66.5');
    fireEvent.press(getByText('Save Log Entry'));

    await waitFor(() =>
      expect(mockUpsertCheckInAsync).toHaveBeenCalledWith({
        entryDate: '2026-08-01',
        weight: 66.5,
      }),
    );
  });

  it('does not save while typing or on blur', () => {
    const { getByPlaceholderText } = render(<CycleTodayView date="2026-08-01" />);

    const input = getByPlaceholderText('e.g. 65');
    fireEvent.changeText(input, '66.5');
    fireEvent(input, 'blur');

    expect(mockUpsertCheckInAsync).not.toHaveBeenCalled();
  });

  it('keeps a typed weight when measurements refetch mid-edit', () => {
    const { getByPlaceholderText, getByDisplayValue, rerender } = render(
      <CycleTodayView date="2026-08-01" />,
    );

    fireEvent.changeText(getByPlaceholderText('e.g. 65'), '70');
    mockMeasurements = { weight: 65 };
    rerender(<CycleTodayView date="2026-08-01" />);

    expect(getByDisplayValue('70')).toBeTruthy();
  });

  it('resumes hydration after an edit is retyped back to the hydrated value', () => {
    mockMeasurements = { weight: 65 };
    const { getByDisplayValue, rerender } = render(<CycleTodayView date="2026-08-01" />);

    const input = getByDisplayValue('65');
    fireEvent.changeText(input, '6');
    fireEvent.changeText(input, '65');
    mockMeasurements = { weight: 70 };
    rerender(<CycleTodayView date="2026-08-01" />);

    expect(getByDisplayValue('70')).toBeTruthy();
  });

  it('skips the check-in when the weight is unchanged', async () => {
    mockMeasurements = { weight: 65 };
    const { getByText } = render(<CycleTodayView date="2026-08-01" />);

    fireEvent.press(getByText('Save Log Entry'));

    await waitFor(() => expect(mockUpsertLogAsync).toHaveBeenCalled());
    expect(mockUpsertCheckInAsync).not.toHaveBeenCalled();
  });

  it('skips the check-in when the field is emptied', async () => {
    mockMeasurements = { weight: 65 };
    const { getByDisplayValue, getByText } = render(<CycleTodayView date="2026-08-01" />);

    fireEvent.changeText(getByDisplayValue('65'), '');
    fireEvent.press(getByText('Save Log Entry'));

    await waitFor(() => expect(mockUpsertLogAsync).toHaveBeenCalled());
    expect(mockUpsertCheckInAsync).not.toHaveBeenCalled();
  });
});

describe('CycleTodayView deferred symptom save', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSymptomEntries = [];
  });

  afterAll(() => {
    mockSymptomEntries = [];
  });

  it('does not save a symptom toggle until Save is pressed', () => {
    const { getByLabelText } = render(<CycleTodayView date="2026-08-01" />);

    fireEvent.press(getByLabelText('toggle-symptom:Nausea'));

    expect(mockCreateEntryAsync).not.toHaveBeenCalled();
    expect(mockDeleteEntryAsync).not.toHaveBeenCalled();
  });

  it('creates toggled-on symptoms on Save', async () => {
    const { getByLabelText, getByText } = render(<CycleTodayView date="2026-08-01" />);

    fireEvent.press(getByLabelText('toggle-symptom:Nausea'));
    fireEvent.press(getByText('Save Log Entry'));

    await waitFor(() =>
      expect(mockCreateEntryAsync).toHaveBeenCalledWith({
        symptom_name_snapshot: 'Nausea',
        severity: 3,
        source: 'cycle',
        entry_date: '2026-08-01',
      }),
    );
    expect(mockDeleteEntryAsync).not.toHaveBeenCalled();
  });

  it('deletes toggled-off symptoms on Save, leaving non-cycle entries alone', async () => {
    mockSymptomEntries = [
      { id: 's1', symptom_name_snapshot: 'Nausea', severity: 3, source: 'cycle', entry_date: '2026-08-01' },
      { id: 's2', symptom_name_snapshot: 'Fatigue', severity: 3, source: 'manual', entry_date: '2026-08-01' },
    ];
    const { getByLabelText, getByText } = render(<CycleTodayView date="2026-08-01" />);

    fireEvent.press(getByLabelText('toggle-symptom:Nausea'));
    fireEvent.press(getByText('Save Log Entry'));

    await waitFor(() => expect(mockDeleteEntryAsync).toHaveBeenCalledWith('s1'));
    expect(mockDeleteEntryAsync).toHaveBeenCalledTimes(1);
    expect(mockCreateEntryAsync).not.toHaveBeenCalled();
  });

  it('leaves an unchanged server selection untouched on Save', async () => {
    mockSymptomEntries = [
      { id: 's1', symptom_name_snapshot: 'Nausea', severity: 3, source: 'cycle', entry_date: '2026-08-01' },
    ];
    const { getByText } = render(<CycleTodayView date="2026-08-01" />);

    fireEvent.press(getByText('Save Log Entry'));

    await waitFor(() => expect(mockUpsertLogAsync).toHaveBeenCalled());
    expect(mockCreateEntryAsync).not.toHaveBeenCalled();
    expect(mockDeleteEntryAsync).not.toHaveBeenCalled();
  });
});

describe('CycleTodayView parent-owned save', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hides the inline button and saves through saveRequestRef', async () => {
    const saveRequestRef: React.MutableRefObject<(() => void) | null> = { current: null };
    const { queryByText } = render(
      <CycleTodayView date="2026-08-01" saveRequestRef={saveRequestRef} hideSaveButton />,
    );

    expect(queryByText('Save Log Entry')).toBeNull();

    saveRequestRef.current?.();
    await waitFor(() => expect(mockUpsertLogAsync).toHaveBeenCalled());
  });
});
