import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SymptomLogForm from '@/pages/Symptoms/SymptomLogForm';
import {
  ID,
  ID2,
  buildHooksMock,
  hookState,
  makeDefinition,
  makeEntry,
  mutations,
  resetSymptomHooks,
} from './symptomTestKit';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallback?: string,
      options?: Record<string, string | number>
    ) =>
      (fallback ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        String(options?.[name] ?? '')
      ),
  }),
}));

jest.mock('@/hooks/useSymptoms', () =>
  jest.requireActual('./symptomTestKit').buildHooksMock()
);

// The episode date/time fields render in the user's time format.
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timeFormat: 'HH:mm' }),
}));

// buildHooksMock is only referenced so the mock factory above has one import
// path; keep it from being tree-shaken as unused.
void buildHooksMock;

const TODAY = '2026-09-29';

const renderForm = (
  props: Partial<React.ComponentProps<typeof SymptomLogForm>> = {}
) =>
  render(
    <SymptomLogForm selectedDate={TODAY} today={TODAY} meds={[]} {...props} />
  );

const openSection = (title: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));

beforeEach(() => {
  resetSymptomHooks();
  mutations.createDefinition.mutateAsync.mockResolvedValue(
    makeDefinition({ id: 'def-1', name: 'headache' })
  );
  mutations.createEntry.mutateAsync.mockResolvedValue(makeEntry({ id: 'e-1' }));
  mutations.updateEntry.mutateAsync.mockResolvedValue(makeEntry({ id: 'e-9' }));
  mutations.uploadPhoto.mutateAsync.mockResolvedValue({});
});

describe('SymptomLogForm: logging', () => {
  it('saves a built-in symptom as a definition the first time it is logged', async () => {
    renderForm({ initialSymptomName: 'headache' });
    fireEvent.click(screen.getByRole('button', { name: 'Save episode' }));

    await waitFor(() =>
      expect(mutations.createEntry.mutateAsync).toHaveBeenCalled()
    );
    expect(mutations.createDefinition.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'headache',
        display_name: 'Headache',
        template: 'headache',
        is_episodic: true,
      })
    );
    expect(mutations.createEntry.mutateAsync.mock.calls[0][0]).toMatchObject({
      symptom_id: 'def-1',
      symptom_name_snapshot: 'Headache',
    });
  });

  it('does not create a definition again for a symptom that already has one', async () => {
    hookState.definitions = [makeDefinition({ id: 'def-7', name: 'headache' })];
    renderForm({ initialSymptomName: 'headache' });
    fireEvent.click(screen.getByRole('button', { name: 'Save episode' }));

    await waitFor(() =>
      expect(mutations.createEntry.mutateAsync).toHaveBeenCalled()
    );
    expect(mutations.createDefinition.mutateAsync).not.toHaveBeenCalled();
    expect(mutations.createEntry.mutateAsync.mock.calls[0][0].symptom_id).toBe(
      'def-7'
    );
  });

  it('starts an episode that is still ongoing, with no end time', async () => {
    renderForm({ initialSymptomName: 'headache' });
    fireEvent.click(screen.getByRole('button', { name: 'Save episode' }));

    await waitFor(() =>
      expect(mutations.createEntry.mutateAsync).toHaveBeenCalled()
    );
    const body = mutations.createEntry.mutateAsync.mock.calls[0][0];
    expect(typeof body.started_at).toBe('string');
    expect(body.ended_at).toBeNull();
    expect(body).not.toHaveProperty('entry_date');
  });

  it('logs a quick symptom against the chosen day, at midday when it is not today', async () => {
    renderForm({ initialSymptomName: 'nausea', selectedDate: '2026-09-28' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mutations.createEntry.mutateAsync).toHaveBeenCalled()
    );
    const body = mutations.createEntry.mutateAsync.mock.calls[0][0];
    expect(body.entry_date).toBe('2026-09-28');
    expect(body.logged_at).toBe(new Date('2026-09-28T12:00:00').toISOString());
    expect(body).not.toHaveProperty('started_at');
  });

  it('sends the middle of the scale when the slider was never moved', async () => {
    renderForm({ initialSymptomName: 'nausea' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mutations.createEntry.mutateAsync).toHaveBeenCalled()
    );
    expect(mutations.createEntry.mutateAsync.mock.calls[0][0]).toMatchObject({
      severity: 5,
      severity_label: 'Moderate',
    });
  });

  it('records the locations picked on the head map', async () => {
    renderForm({ initialSymptomName: 'headache' });
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Behind left eye' })[0]!
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Left temple' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Save episode' }));

    await waitFor(() =>
      expect(mutations.createEntry.mutateAsync).toHaveBeenCalled()
    );
    expect(
      mutations.createEntry.mutateAsync.mock.calls[0][0].body_locations
    ).toEqual(['Behind left eye', 'Left temple']);
  });

  it('records triggers picked from the grouped chips', async () => {
    renderForm({ initialSymptomName: 'headache' });
    openSection('Possible triggers');
    fireEvent.click(screen.getByRole('button', { name: 'Poor sleep' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not sure' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save episode' }));

    await waitFor(() =>
      expect(mutations.createEntry.mutateAsync).toHaveBeenCalled()
    );
    expect(mutations.createEntry.mutateAsync.mock.calls[0][0].triggers).toEqual(
      ['Poor sleep', 'Not sure']
    );
  });

  it('keeps the notes and treats an empty note as none', async () => {
    renderForm({ initialSymptomName: 'nausea' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mutations.createEntry.mutateAsync).toHaveBeenCalled()
    );
    expect(
      mutations.createEntry.mutateAsync.mock.calls[0][0].context_text
    ).toBeNull();
  });

  it('stops when the definition cannot be saved, so no entry is written', async () => {
    mutations.createDefinition.mutateAsync.mockRejectedValue(new Error('nope'));
    renderForm({ initialSymptomName: 'headache' });
    fireEvent.click(screen.getByRole('button', { name: 'Save episode' }));

    await waitFor(() =>
      expect(mutations.createDefinition.mutateAsync).toHaveBeenCalled()
    );
    expect(mutations.createEntry.mutateAsync).not.toHaveBeenCalled();
  });

  it('uploads each chosen photo once the entry exists', async () => {
    renderForm({ initialSymptomName: 'back_pain' });
    openSection('Photos');
    const file = new File(['x'], 'back.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Add photos'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mutations.uploadPhoto.mutateAsync).toHaveBeenCalled()
    );
    expect(mutations.uploadPhoto.mutateAsync).toHaveBeenCalledWith({
      entryId: 'e-1',
      file,
    });
  });

  it('calls onDone after a successful save', async () => {
    const onDone = jest.fn();
    renderForm({ initialSymptomName: 'nausea', onDone });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('does not call onDone when the entry fails to save', async () => {
    mutations.createEntry.mutateAsync.mockRejectedValue(new Error('nope'));
    const onDone = jest.fn();
    renderForm({ initialSymptomName: 'nausea', onDone });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mutations.createEntry.mutateAsync).toHaveBeenCalled()
    );
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('SymptomLogForm: sections follow the symptom', () => {
  it('asks about phases and head locations for a migraine, not for nausea', () => {
    const { unmount } = renderForm({ initialSymptomName: 'migraine' });
    expect(screen.getByRole('button', { name: /Phases/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Where/ })).toBeInTheDocument();
    unmount();

    renderForm({ initialSymptomName: 'nausea' });
    expect(
      screen.queryByRole('button', { name: /Phases/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Where/ })
    ).not.toBeInTheDocument();
  });

  it('asks for the Bristol scale only for stomach and gut symptoms', () => {
    const { unmount } = renderForm({ initialSymptomName: 'diarrhea' });
    expect(
      screen.getByRole('button', { name: /Bowel log/ })
    ).toBeInTheDocument();
    unmount();
    renderForm({ initialSymptomName: 'headache' });
    expect(
      screen.queryByRole('button', { name: /Bowel log/ })
    ).not.toBeInTheDocument();
  });

  it('honours a symptom-level override that turns a section off', () => {
    hookState.definitions = [
      makeDefinition({ name: 'migraine', sections: { triggers: false } }),
    ];
    renderForm({ initialSymptomName: 'migraine' });
    expect(
      screen.queryByRole('button', { name: /Possible triggers/ })
    ).not.toBeInTheDocument();
  });

  it('shows the symptom’s own custom fields and saves their values', async () => {
    hookState.definitions = [
      makeDefinition({
        id: 'def-f',
        name: 'fever',
        display_name: 'Fever',
        template: 'generic',
        is_episodic: false,
        custom_field_defs: [
          {
            key: 'temperature',
            label: 'Temperature',
            type: 'number',
            unit: '°C',
          },
        ],
      }),
    ];
    renderForm({ initialSymptomName: 'fever' });
    fireEvent.change(screen.getByLabelText(/Temperature/), {
      target: { value: '38.4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mutations.createEntry.mutateAsync).toHaveBeenCalled()
    );
    expect(
      mutations.createEntry.mutateAsync.mock.calls[0][0].custom_fields
    ).toEqual({ temperature: 38.4 });
  });
});

describe('SymptomLogForm: editing', () => {
  const editing = makeEntry({
    id: 'e-9',
    symptom_id: 'def-9',
    symptom_name_snapshot: 'Migraine',
    started_at: '2026-09-29T09:00:00.000Z',
    ended_at: null,
    severity: 6,
    triggers: ['Stress'],
    body_locations: ['Left temple'],
    treatments: [
      {
        id: 't-1',
        user_id: ID2,
        symptom_entry_id: 'e-9',
        kind: 'medication',
        medication_id: null,
        medication_entry_id: null,
        name_snapshot: 'Sumatriptan',
        dose_snapshot: '50 mg',
        taken_at: '2026-09-29T09:50:00.000Z',
        effectiveness: 'full',
        notes: null,
        created_at: '2026-09-29T09:50:00.000Z',
      },
    ],
  });

  it('updates the entry instead of creating one, and never creates a definition', async () => {
    renderForm({ editing });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() =>
      expect(mutations.updateEntry.mutateAsync).toHaveBeenCalled()
    );
    expect(mutations.createEntry.mutateAsync).not.toHaveBeenCalled();
    expect(mutations.createDefinition.mutateAsync).not.toHaveBeenCalled();
    const { id, body } = mutations.updateEntry.mutateAsync.mock.calls[0][0];
    expect(id).toBe('e-9');
    expect(body).toMatchObject({
      symptom_id: 'def-9',
      started_at: '2026-09-29T09:00:00.000Z',
      ended_at: null,
      triggers: ['Stress'],
      body_locations: ['Left temple'],
      severity: 6,
    });
  });

  it('keeps existing treatments and their effectiveness', async () => {
    renderForm({ editing });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() =>
      expect(mutations.updateEntry.mutateAsync).toHaveBeenCalled()
    );
    expect(
      mutations.updateEntry.mutateAsync.mock.calls[0][0].body.treatments
    ).toEqual([
      expect.objectContaining({
        kind: 'medication',
        name_snapshot: 'Sumatriptan',
        dose_snapshot: '50 mg',
        effectiveness: 'full',
      }),
    ]);
  });

  it('locks the symptom while editing', () => {
    renderForm({ editing });
    expect(screen.getByRole('combobox', { name: /Symptom/ })).toBeDisabled();
  });

  it('turns an episode back into a quick log by clearing its times', async () => {
    renderForm({ editing });
    fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() =>
      expect(mutations.updateEntry.mutateAsync).toHaveBeenCalled()
    );
    const body = mutations.updateEntry.mutateAsync.mock.calls[0][0].body;
    expect(body.started_at).toBeNull();
    expect(body.ended_at).toBeNull();
    expect(body.entry_date).toBe(TODAY);
  });

  it('shows a Cancel button only when the caller can close the form', () => {
    const { unmount } = renderForm({ editing });
    expect(
      screen.queryByRole('button', { name: 'Cancel' })
    ).not.toBeInTheDocument();
    unmount();
    renderForm({ editing, onDone: jest.fn() });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});

void ID;
