import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { HeartRateZonesResponse } from '@workspace/shared';
import { renderWithClient } from '@/tests/test-utils';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { HeartRateZoneSettings } from '@/pages/Settings/HeartRateZoneSettings';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      options?: string | ({ defaultValue?: string } & Record<string, unknown>)
    ) =>
      typeof options === 'string'
        ? options
        : options?.defaultValue?.replace(/{{(\w+)}}/g, (_m, name) =>
            String(options[name])
          ),
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

const mockUseHeartRateZones = jest.fn();
const mockMutate = jest.fn();
jest.mock('@/hooks/Settings/useHeartRateZones', () => ({
  useHeartRateZones: () => mockUseHeartRateZones(),
  useUpdateHeartRateZonesMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

const response = (
  settings: Partial<HeartRateZonesResponse['settings']> = {},
  resolved: Partial<HeartRateZonesResponse['resolved']> = {}
): HeartRateZonesResponse => ({
  settings: {
    max_heart_rate: null,
    resting_heart_rate: null,
    method: 'percent_max',
    custom_floors: null,
    display_zones: 5,
    ...settings,
  },
  resolved: {
    max_hr: 188,
    max_hr_source: 'age',
    resting_hr: null,
    method: 'percent_max',
    effective_method: 'percent_max',
    zones: [
      { zone: 1, lower_bpm: 94, upper_bpm: 112 },
      { zone: 2, lower_bpm: 113, upper_bpm: 131 },
      { zone: 3, lower_bpm: 132, upper_bpm: 149 },
      { zone: 4, lower_bpm: 150, upper_bpm: 168 },
      { zone: 5, lower_bpm: 169, upper_bpm: null },
    ],
    ...resolved,
  },
});

const renderSection = () =>
  renderWithClient(
    <Accordion type="multiple" defaultValue={['heart-rate-zones']}>
      <AccordionItem value="heart-rate-zones">
        <HeartRateZoneSettings />
      </AccordionItem>
    </Accordion>
  );

describe('HeartRateZoneSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the five zones with bpm ranges and where the max came from', () => {
    mockUseHeartRateZones.mockReturnValue({ data: response() });
    renderSection();

    expect(screen.getByTestId('hr-zone-summary')).toHaveTextContent(
      'Max heart rate 188 bpm. From your date of birth.'
    );
    expect(screen.getByTestId('hr-zone-1')).toHaveTextContent('94–112 bpm');
    expect(screen.getByTestId('hr-zone-5')).toHaveTextContent('169+ bpm');
  });

  it('shows four tiers when the person chose them, with zones 1 and 2 merged', () => {
    mockUseHeartRateZones.mockReturnValue({
      data: response({ display_zones: 4 }),
    });
    renderSection();

    expect(screen.getByTestId('hr-zone-1')).toHaveTextContent('Light');
    expect(screen.getByTestId('hr-zone-1')).toHaveTextContent('94–131 bpm');
    expect(screen.getByTestId('hr-zone-2')).toHaveTextContent('Moderate');
    expect(screen.getByTestId('hr-zone-4')).toHaveTextContent('Peak');
    expect(screen.getByTestId('hr-zone-4')).toHaveTextContent('169+ bpm');
    expect(screen.queryByTestId('hr-zone-5')).toBeNull();
  });

  it('says when the person set the max heart rate', () => {
    mockUseHeartRateZones.mockReturnValue({
      data: response(
        { max_heart_rate: 180 },
        { max_hr: 180, max_hr_source: 'user' }
      ),
    });
    renderSection();

    expect(screen.getByTestId('hr-zone-summary')).toHaveTextContent(
      'You set it'
    );
    expect(screen.getByLabelText('Max heart rate (bpm)')).toHaveValue(180);
  });

  it('saves the changed max heart rate', () => {
    mockUseHeartRateZones.mockReturnValue({ data: response() });
    renderSection();

    fireEvent.change(screen.getByLabelText('Max heart rate (bpm)'), {
      target: { value: '182' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        max_heart_rate: 182,
        resting_heart_rate: null,
        method: 'percent_max',
        display_zones: 5,
      },
      expect.any(Object)
    );
  });

  it('rejects an out-of-range max heart rate without calling the server', () => {
    mockUseHeartRateZones.mockReturnValue({ data: response() });
    renderSection();

    fireEvent.change(screen.getByLabelText('Max heart rate (bpm)'), {
      target: { value: '400' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Max heart rate must be a whole number from 100 to 250 bpm.'
    );
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('resets to the defaults', () => {
    mockUseHeartRateZones.mockReturnValue({
      data: response({ max_heart_rate: 180 }),
    });
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

    expect(mockMutate).toHaveBeenCalledWith(
      { reset: true },
      expect.any(Object)
    );
  });

  it('explains when the chosen method fell back to percent of max', () => {
    mockUseHeartRateZones.mockReturnValue({
      data: response(
        { method: 'heart_rate_reserve' },
        { method: 'heart_rate_reserve', effective_method: 'percent_max' }
      ),
    });
    renderSection();

    expect(screen.getByTestId('hr-zone-fallback')).toBeInTheDocument();
  });
});
