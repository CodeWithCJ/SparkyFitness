import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import * as labApi from '@/api/Labs/labResultsApi';
import Labs from '@/pages/Labs/Labs';
import { customMarker, first, result, wrapper } from './labsTestKit';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/api/Labs/labResultsApi');
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));
jest.mock('@/hooks/Settings/useProfile', () => ({
  useProfileQuery: () => ({ data: { gender: 'male' } }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: 'UTC' }),
}));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Passthrough,
    LineChart: Passthrough,
    Line: () => null,
    CartesianGrid: () => null,
    ReferenceArea: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
  };
});

const api = jest.mocked(labApi);

const renderPage = () => {
  const { Wrapper } = wrapper();
  return render(<Labs />, { wrapper: Wrapper });
};

beforeEach(() => {
  jest.clearAllMocks();
  api.listLabMarkers.mockResolvedValue([customMarker()]);
  api.listLatestLabResults.mockResolvedValue([
    result(),
    result({
      id: 'r2',
      marker_key: 'ldl',
      value_numeric: 160,
      unit: 'mg/dL',
      ref_range_low: null,
      ref_range_high: 99,
    }),
  ]);
  api.listLabResults.mockResolvedValue([
    result({ id: 'r0', entry_date: '2026-03-01', value_numeric: 5.4 }),
    result(),
  ]);
});

describe('Labs page', () => {
  it('lists the markers with their latest result and range status', async () => {
    renderPage();

    expect(await screen.findByText('HbA1c')).toBeInTheDocument();
    expect(screen.getByText('5.1 %')).toBeInTheDocument();
    expect(screen.getByText('In range')).toBeInTheDocument();
    // LDL 160 is over its own printed range of 99.
    expect(screen.getByText('160 mg/dL')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    // A custom marker with no result still appears.
    expect(screen.getByText('Homocysteine')).toBeInTheDocument();
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('shows an empty state with no markers or results', async () => {
    api.listLabMarkers.mockResolvedValue([]);
    api.listLatestLabResults.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/No lab results yet/)).toBeInTheDocument();
  });

  it('opens a marker with its history and reference range', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /HbA1c/ }));

    await waitFor(() =>
      expect(api.listLabResults).toHaveBeenCalledWith({
        markerKey: 'hba1c',
        limit: 5000,
      })
    );
    expect(
      await screen.findByText('Reference range: 4 - 5.6 %')
    ).toBeInTheDocument();
    expect(screen.getByTestId('lab-marker-chart')).toBeInTheDocument();
    expect(screen.getByText('2026-03-01')).toBeInTheDocument();
  });

  it('deletes a result after confirming', async () => {
    api.deleteLabResult.mockResolvedValue(undefined);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /HbA1c/ }));
    const buttons = await screen.findAllByRole('button', {
      name: 'Delete result',
    });
    fireEvent.click(first(buttons));

    expect(screen.getByText('Delete this lab result?')).toBeInTheDocument();
    expect(api.deleteLabResult).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteLabResult).toHaveBeenCalledTimes(1));
  });

  it('deletes a built-in marker by key and a custom one by id', async () => {
    api.deleteBuiltinMarkerResults.mockResolvedValue({ results: 2 });
    api.deleteLabMarker.mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /HbA1c/ }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Delete marker and all results',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(api.deleteBuiltinMarkerResults).toHaveBeenCalledWith('hba1c')
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /Homocysteine/ })
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Delete marker and all results',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(api.deleteLabMarker).toHaveBeenCalledWith(customMarker().id)
    );
  });

  it('adds a result for a built-in marker, prefilled from its preset', async () => {
    api.listLatestLabResults.mockResolvedValue([]);
    api.listLabMarkers.mockResolvedValue([]);
    api.createLabResult.mockResolvedValue(result());
    renderPage();

    fireEvent.click(
      first(await screen.findAllByRole('button', { name: 'Add lab result' }))
    );
    fireEvent.change(screen.getByLabelText('Search markers'), {
      target: { value: 'hba1c' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'HbA1c' }));

    expect(screen.getByLabelText('Unit')).toHaveValue('%');
    fireEvent.change(screen.getByLabelText('Result'), {
      target: { value: '5,2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.createLabResult).toHaveBeenCalledTimes(1));
    expect(first(api.createLabResult.mock.calls)[0]).toMatchObject({
      marker_key: 'hba1c',
      value_numeric: 5.2,
      unit: '%',
      ref_range_low: 4,
      ref_range_high: 5.6,
      source: 'manual',
    });
  });

  it('rejects a future date and a reversed range without saving', async () => {
    api.listLatestLabResults.mockResolvedValue([]);
    api.listLabMarkers.mockResolvedValue([]);
    renderPage();

    fireEvent.click(
      first(await screen.findAllByRole('button', { name: 'Add lab result' }))
    );
    fireEvent.change(screen.getByLabelText('Search markers'), {
      target: { value: 'hba1c' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'HbA1c' }));
    fireEvent.change(screen.getByLabelText('Result'), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByLabelText('Low'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /low value not above/
    );

    fireEvent.change(screen.getByLabelText('Low'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Date of test'), {
      target: { value: '2999-01-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /cannot be in the future/
    );
    expect(api.createLabResult).not.toHaveBeenCalled();
  });

  it('deletes imported results after confirming', async () => {
    api.deleteLabImports.mockResolvedValue({
      reports: 1,
      results: 3,
      markers: 0,
    });
    renderPage();
    await screen.findByText('HbA1c');

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'More actions' }),
      {
        button: 0,
        ctrlKey: false,
      }
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete imported results' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteLabImports).toHaveBeenCalledTimes(1));
  });

  it('shows the load error, not an empty chart, when a history fails', async () => {
    api.listLabResults.mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /HbA1c/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your lab results.'
    );
    expect(screen.queryByText('No results yet')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lab-marker-chart')).not.toBeInTheDocument();
  });

  it('creates a new marker with its result in one request, and retries the same request', async () => {
    api.listLatestLabResults.mockResolvedValue([]);
    api.listLabMarkers.mockResolvedValue([]);
    api.createLabResult
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(result());
    renderPage();

    fireEvent.click(
      first(await screen.findAllByRole('button', { name: 'Add lab result' }))
    );
    fireEvent.change(screen.getByLabelText('Search markers'), {
      target: { value: 'Zzz Marker' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add "Zzz Marker"/ }));
    fireEvent.change(screen.getByLabelText('Result', { exact: true }), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.createLabResult).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.createLabResult).toHaveBeenCalledTimes(2));

    // The marker is named in the result request; there is no separate
    // marker request that could leave an empty marker behind.
    for (const [body] of api.createLabResult.mock.calls) {
      expect(body).toMatchObject({ custom_marker_name: 'Zzz Marker' });
      expect(body).not.toHaveProperty('custom_marker_id');
    }
  });

  it('drops the saved range when only the unit of a saved result is changed', async () => {
    api.updateLabResult.mockResolvedValue(result());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /HbA1c/ }));
    fireEvent.click(
      first(await screen.findAllByRole('button', { name: 'Edit' }))
    );

    fireEvent.change(screen.getByLabelText('Unit'), {
      target: { value: 'mmol/mol' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.updateLabResult).toHaveBeenCalledTimes(1));
    expect(first(api.updateLabResult.mock.calls)[1]).toMatchObject({
      unit: 'mmol/mol',
      ref_range_low: null,
      ref_range_high: null,
    });
  });

  it('keeps an edited range when the unit changes too', async () => {
    api.updateLabResult.mockResolvedValue(result());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /HbA1c/ }));
    fireEvent.click(
      first(await screen.findAllByRole('button', { name: 'Edit' }))
    );

    fireEvent.change(screen.getByLabelText('Unit'), {
      target: { value: 'mmol/mol' },
    });
    fireEvent.change(screen.getByLabelText('Low'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('High'), {
      target: { value: '38' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.updateLabResult).toHaveBeenCalledTimes(1));
    expect(first(api.updateLabResult.mock.calls)[1]).toMatchObject({
      unit: 'mmol/mol',
      ref_range_low: 20,
      ref_range_high: 38,
    });
  });

  it('shows a load error, not the empty state, when the markers fail to load', async () => {
    api.listLabMarkers.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your lab results.'
    );
    expect(screen.queryByText(/No lab results yet/)).not.toBeInTheDocument();
  });

  it('shows a load error when the latest results fail to load', async () => {
    api.listLatestLabResults.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your lab results.'
    );
    expect(screen.queryByText('Homocysteine')).not.toBeInTheDocument();
  });

  it('saves an untouched value and range of an edited result exactly', async () => {
    const precise = 5.123456789012346;
    api.listLabResults.mockResolvedValue([
      result({
        value_numeric: precise,
        ref_range_low: 3.900000000000001,
        ref_range_high: 5.600000000000001,
      }),
    ]);
    api.updateLabResult.mockResolvedValue(result());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /HbA1c/ }));
    fireEvent.click(
      first(await screen.findAllByRole('button', { name: 'Edit' }))
    );

    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'fasting' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.updateLabResult).toHaveBeenCalledTimes(1));
    expect(first(api.updateLabResult.mock.calls)[1]).toMatchObject({
      value_numeric: precise,
      ref_range_low: 3.900000000000001,
      ref_range_high: 5.600000000000001,
      notes: 'fasting',
    });
  });

  it('asks for a date instead of saving a result without one', async () => {
    api.listLatestLabResults.mockResolvedValue([]);
    api.listLabMarkers.mockResolvedValue([]);
    renderPage();

    fireEvent.click(
      first(await screen.findAllByRole('button', { name: 'Add lab result' }))
    );
    fireEvent.change(screen.getByLabelText('Search markers'), {
      target: { value: 'hba1c' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'HbA1c' }));
    fireEvent.change(screen.getByLabelText('Result', { exact: true }), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByLabelText('Date of test'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter the date of the test.'
    );
    expect(api.createLabResult).not.toHaveBeenCalled();
  });

  it('edits the notes of a text-only result and keeps its text', async () => {
    api.listLabResults.mockResolvedValue([
      result({ value_numeric: null, value_text: 'Negative', unit: '' }),
    ]);
    api.updateLabResult.mockResolvedValue(result());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /HbA1c/ }));
    fireEvent.click(
      first(await screen.findAllByRole('button', { name: 'Edit' }))
    );

    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'checked twice' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.updateLabResult).toHaveBeenCalledTimes(1));
    const body = first(api.updateLabResult.mock.calls)[1];
    expect(body).toMatchObject({ notes: 'checked twice' });
    expect(body).not.toHaveProperty('value_numeric');
  });

  it('clears the text of a text-only result when a number replaces it', async () => {
    api.listLabResults.mockResolvedValue([
      result({ value_numeric: null, value_text: 'Negative', unit: '' }),
    ]);
    api.updateLabResult.mockResolvedValue(result());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /HbA1c/ }));
    fireEvent.click(
      first(await screen.findAllByRole('button', { name: 'Edit' }))
    );

    fireEvent.change(screen.getByLabelText('Result', { exact: true }), {
      target: { value: '0.2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.updateLabResult).toHaveBeenCalledTimes(1));
    expect(first(api.updateLabResult.mock.calls)[1]).toMatchObject({
      value_numeric: 0.2,
      value_text: null,
    });
  });

  it('prefills the unit and range when Add is opened from a marker', async () => {
    // A latest result that differs from the HbA1c preset (% with 4 - 5.6), so
    // the test fails if the dialog seeds from the preset instead.
    api.listLatestLabResults.mockResolvedValue([
      result({
        value_numeric: 36,
        unit: 'mmol/mol',
        ref_range_low: 20,
        ref_range_high: 42,
      }),
    ]);
    api.createLabResult.mockResolvedValue(result());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /HbA1c/ }));
    // The marker view's own Add button (the page header has one too).
    const addButtons = await screen.findAllByRole('button', {
      name: 'Add lab result',
    });
    fireEvent.click(addButtons[addButtons.length - 1] as HTMLElement);

    expect(screen.getByLabelText('Unit')).toHaveValue('mmol/mol');
    expect(screen.getByLabelText('Low')).toHaveValue('20');
    expect(screen.getByLabelText('High')).toHaveValue('42');
    fireEvent.change(screen.getByLabelText('Result', { exact: true }), {
      target: { value: '34' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.createLabResult).toHaveBeenCalledTimes(1));
    expect(first(api.createLabResult.mock.calls)[0]).toMatchObject({
      marker_key: 'hba1c',
      value_numeric: 34,
      unit: 'mmol/mol',
      ref_range_low: 20,
      ref_range_high: 42,
    });
  });
});
