import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import OngoingEpisodeCard from '@/pages/Symptoms/OngoingEpisodeCard';
import EpisodeDetailDialog from '@/pages/Symptoms/EpisodeDetailDialog';
import ManageSymptomsDialog from '@/pages/Symptoms/ManageSymptomsDialog';
import SymptomCalendar from '@/pages/Symptoms/SymptomCalendar';
import SymptomHistoryList from '@/pages/Symptoms/SymptomHistoryList';
import SymptomsHub from '@/pages/Symptoms/SymptomsHub';
import {
  ID,
  ID2,
  hookState,
  makeDefinition,
  makeEntry,
  makeOption,
  mutations,
  resetSymptomHooks,
} from './symptomTestKit';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/hooks/useSymptoms', () =>
  jest.requireActual('./symptomTestKit').buildHooksMock()
);

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    formatTime: (d: string | Date) => new Date(d).toISOString().slice(11, 16),
    formatDateInUserTimezone: (d: string | Date) =>
      new Date(d).toISOString().slice(0, 10),
  }),
}));

// The dose-overlay calendar belongs to Medications and has its own tests.
jest.mock('@/pages/Medications/SymptomHistoryCalendar', () => ({
  __esModule: true,
  default: () => <div data-testid="medication-calendar" />,
}));

const SELECTED = '2026-09-29';

beforeEach(() => {
  resetSymptomHooks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-09-29T11:15:00.000Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

const ongoingEpisode = makeEntry({
  id: 'ep-1',
  symptom_name_snapshot: 'Migraine',
  started_at: '2026-09-29T09:00:00.000Z',
  logged_at: '2026-09-29T09:00:00.000Z',
  severity: 7,
  body_locations: ['Behind left eye'],
});

describe('OngoingEpisodeCard', () => {
  it('renders nothing when no episode is running', () => {
    const { container } = render(
      <OngoingEpisodeCard episodes={[]} meds={[]} onOpen={jest.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the running time, severity, place and start time', () => {
    render(
      <OngoingEpisodeCard
        episodes={[ongoingEpisode]}
        meds={[]}
        onOpen={jest.fn()}
      />
    );
    expect(screen.getByText('2 h 15 m')).toBeInTheDocument();
    expect(screen.getByText('Migraine')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/Behind left eye/)).toBeInTheDocument();
    expect(screen.getByText(/started 09:00/)).toBeInTheDocument();
  });

  it('updates the running time once a minute', () => {
    render(
      <OngoingEpisodeCard
        episodes={[ongoingEpisode]}
        meds={[]}
        onOpen={jest.fn()}
      />
    );
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('2 h 16 m')).toBeInTheDocument();
  });

  it('opens the episode from its name', () => {
    const onOpen = jest.fn();
    render(
      <OngoingEpisodeCard
        episodes={[ongoingEpisode]}
        meds={[]}
        onOpen={onOpen}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Migraine/ }));
    expect(onOpen).toHaveBeenCalledWith(ongoingEpisode);
  });

  it('records a new severity reading from the popover', () => {
    render(
      <OngoingEpisodeCard
        episodes={[ongoingEpisode]}
        meds={[]}
        onOpen={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Update severity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save reading' }));
    expect(mutations.addSeverity.mutate).toHaveBeenCalledWith(
      { id: 'ep-1', severity: 7 },
      expect.any(Object)
    );
  });

  it('ends the episode with an end time and the treatments it had', () => {
    const withTreatment = {
      ...ongoingEpisode,
      treatments: [
        {
          id: 't-1',
          user_id: ID2,
          symptom_entry_id: 'ep-1',
          kind: 'relief' as const,
          medication_id: null,
          medication_entry_id: null,
          name_snapshot: 'Rest',
          dose_snapshot: null,
          taken_at: null,
          effectiveness: 'partial' as const,
          notes: null,
          created_at: '2026-09-29T09:30:00.000Z',
        },
      ],
    };
    render(
      <OngoingEpisodeCard
        episodes={[withTreatment]}
        meds={[]}
        onOpen={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'End episode' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Helped' }));
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'End episode' })
    );

    expect(mutations.endEpisode.mutate).toHaveBeenCalledTimes(1);
    const [{ id, body }] = mutations.endEpisode.mutate.mock.calls[0];
    expect(id).toBe('ep-1');
    expect(typeof body.ended_at).toBe('string');
    expect(body.treatments).toEqual([
      expect.objectContaining({ name_snapshot: 'Rest', effectiveness: 'full' }),
    ]);
  });

  it('lets the end time be set a while ago with a quick chip', () => {
    render(
      <OngoingEpisodeCard
        episodes={[ongoingEpisode]}
        meds={[]}
        onOpen={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'End episode' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '−1 h' }));
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'End episode' })
    );
    expect(mutations.endEpisode.mutate.mock.calls[0][0].body.ended_at).toBe(
      '2026-09-29T10:15:00.000Z'
    );
  });

  it('adds relief by saving the whole treatment list', () => {
    render(
      <OngoingEpisodeCard
        episodes={[ongoingEpisode]}
        meds={[]}
        onOpen={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add relief' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Cold compress' })
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(mutations.updateEntry.mutate).toHaveBeenCalledWith(
      {
        id: 'ep-1',
        body: {
          treatments: [
            expect.objectContaining({
              kind: 'relief',
              name_snapshot: 'Cold compress',
            }),
          ],
        },
      },
      expect.any(Object)
    );
  });

  it('uses the symptom’s own scale for the severity update', () => {
    hookState.definitions = [
      makeDefinition({ id: 'def-1', scale_type: 'none-severe' }),
    ];
    render(
      <OngoingEpisodeCard
        episodes={[{ ...ongoingEpisode, symptom_id: 'def-1', severity: 2 }]}
        meds={[]}
        onOpen={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Update severity' }));
    expect(
      screen.getByRole('button', { name: 'Moderate' })
    ).toBeInTheDocument();
  });
});

describe('SymptomHistoryList', () => {
  it('shows a loading and an empty state', () => {
    const { rerender } = render(
      <SymptomHistoryList entries={[]} loading onOpen={jest.fn()} />
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    rerender(
      <SymptomHistoryList entries={[]} loading={false} onOpen={jest.fn()} />
    );
    expect(screen.getByText(/Nothing logged/)).toBeInTheDocument();
  });

  it('marks ended episodes with a duration, running ones as ongoing, and cycle rows', () => {
    render(
      <SymptomHistoryList
        loading={false}
        onOpen={jest.fn()}
        entries={[
          makeEntry({
            id: 'a',
            symptom_name_snapshot: 'Migraine',
            started_at: '2026-09-29T09:00:00.000Z',
            ended_at: '2026-09-29T11:30:00.000Z',
          }),
          makeEntry({
            id: 'b',
            symptom_name_snapshot: 'Aura',
            started_at: '2026-09-29T09:00:00.000Z',
          }),
          makeEntry({
            id: 'c',
            symptom_name_snapshot: 'Cramps',
            source: 'cycle',
          }),
        ]}
      />
    );
    expect(screen.getByText('2 h 30 m')).toBeInTheDocument();
    expect(screen.getByText('ongoing')).toBeInTheDocument();
    expect(screen.getByText('Cycle')).toBeInTheDocument();
  });

  it('lists places and up to two triggers, and opens an entry on click', () => {
    const onOpen = jest.fn();
    const entry = makeEntry({
      symptom_name_snapshot: 'Back pain',
      body_locations: ['Lower back'],
      triggers: ['Lifting', 'Sitting', 'Cold'],
    });
    render(
      <SymptomHistoryList entries={[entry]} loading={false} onOpen={onOpen} />
    );
    expect(
      screen.getByText(/Lower back · Lifting · Sitting/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Cold/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back pain/ }));
    expect(onOpen).toHaveBeenCalledWith(entry);
  });
});

describe('SymptomCalendar', () => {
  it('names the month and moves between months', () => {
    render(
      <SymptomCalendar selectedDate={SELECTED} onDateChange={jest.fn()} />
    );
    expect(screen.getByText(/September 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText(/October 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByText(/August 2026/)).toBeInTheDocument();
  });

  it('rolls over the year boundary', () => {
    render(
      <SymptomCalendar selectedDate="2026-12-15" onDateChange={jest.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText(/January 2027/)).toBeInTheDocument();
  });

  it('tints days by how severe the worst entry was, and greens symptom-free days', () => {
    hookState.entries = [
      makeEntry({
        id: 'a',
        entry_date: '2026-09-08',
        peak_severity: 9,
        severity: 9,
      }),
      makeEntry({
        id: 'b',
        entry_date: '2026-09-09',
        peak_severity: 4,
        severity: 4,
      }),
    ];
    hookState.freeDays = [{ id: 'f', entry_date: '2026-09-10' }];
    render(
      <SymptomCalendar selectedDate={SELECTED} onDateChange={jest.fn()} />
    );
    expect(
      screen.getByRole('button', { name: '2026-09-08' }).className
    ).toMatch(/bg-red-500/);
    expect(
      screen.getByRole('button', { name: '2026-09-09' }).className
    ).toMatch(/bg-amber-500/);
    expect(
      screen.getByRole('button', { name: '2026-09-10' }).className
    ).toMatch(/bg-green-500/);
    // A day with nothing logged is unknown: no tint at all.
    const unknown = screen.getByRole('button', {
      name: '2026-09-11',
    }).className;
    expect(unknown).not.toMatch(/bg-(red|amber|green)-500/);
  });

  it('lets an entry win over a symptom-free marker on the same day', () => {
    hookState.entries = [
      makeEntry({ entry_date: '2026-09-08', peak_severity: 9, severity: 9 }),
    ];
    hookState.freeDays = [{ id: 'f', entry_date: '2026-09-08' }];
    render(
      <SymptomCalendar selectedDate={SELECTED} onDateChange={jest.fn()} />
    );
    const cls = screen.getByRole('button', { name: '2026-09-08' }).className;
    expect(cls).toMatch(/bg-red-500/);
    expect(cls).not.toMatch(/bg-green-500\/15/);
  });

  it('selects a day and marks the current one', () => {
    const onDateChange = jest.fn();
    render(
      <SymptomCalendar selectedDate={SELECTED} onDateChange={onDateChange} />
    );
    expect(screen.getByRole('button', { name: SELECTED })).toHaveAttribute(
      'aria-current',
      'date'
    );
    fireEvent.click(screen.getByRole('button', { name: '2026-09-03' }));
    expect(onDateChange).toHaveBeenCalledWith('2026-09-03');
  });

  it('starts weeks on Monday', () => {
    // 1 September 2026 is a Tuesday, so one leading blank precedes it.
    const { container } = render(
      <SymptomCalendar selectedDate={SELECTED} onDateChange={jest.fn()} />
    );
    const grid = container.querySelector('.grid-cols-7') as HTMLElement;
    const cells = Array.from(grid.children);
    const firstDay = cells.findIndex(
      (c) => c.getAttribute('aria-label') === '2026-09-01'
    );
    expect(firstDay).toBe(7 + 1);
  });
});

describe('EpisodeDetailDialog', () => {
  const timelineEntry = makeEntry({
    id: 'ep-2',
    started_at: '2026-09-29T09:00:00.000Z',
    ended_at: '2026-09-29T11:00:00.000Z',
    severity: 4,
    peak_severity: 8,
    severity_timeline: [
      { at: '2026-09-29T09:00:00.000Z', severity: 8 },
      { at: '2026-09-29T10:30:00.000Z', severity: 4 },
    ],
    body_locations: ['Left temple'],
    triggers: ['Stress'],
    context_text: 'After a long call',
    photo_ids: ['p-1'],
  });

  it('is closed with no entry', () => {
    render(
      <EpisodeDetailDialog
        entry={null}
        meds={[]}
        onClose={jest.fn()}
        onEdit={jest.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the timing, chart, details, notes and photos', () => {
    render(
      <EpisodeDetailDialog
        entry={timelineEntry}
        meds={[]}
        onClose={jest.fn()}
        onEdit={jest.fn()}
      />
    );
    expect(screen.getByText(/09:00 → 11:00 · 2 h/)).toBeInTheDocument();
    expect(screen.getByText('peak 8')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /2 readings/ })).toBeInTheDocument();
    expect(screen.getByText('Left temple')).toBeInTheDocument();
    expect(screen.getByText('Stress')).toBeInTheDocument();
    expect(screen.getByText('After a long call')).toBeInTheDocument();
    expect(screen.getByAltText('Saved photo')).toHaveAttribute(
      'src',
      '/api/v2/symptoms/photos/file/p-1'
    );
  });

  it('has no chart for a plain quick log', () => {
    render(
      <EpisodeDetailDialog
        entry={makeEntry()}
        meds={[]}
        onClose={jest.fn()}
        onEdit={jest.fn()}
      />
    );
    expect(
      screen.queryByRole('img', { name: /readings/ })
    ).not.toBeInTheDocument();
  });

  it('saves changed treatments only once they differ', () => {
    render(
      <EpisodeDetailDialog
        entry={timelineEntry}
        meds={[]}
        onClose={jest.fn()}
        onEdit={jest.fn()}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Save treatments' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dark, quiet room' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save treatments' }));
    expect(mutations.updateEntry.mutate).toHaveBeenCalledWith({
      id: 'ep-2',
      body: {
        treatments: [
          expect.objectContaining({ name_snapshot: 'Dark, quiet room' }),
        ],
      },
    });
  });

  it('asks before deleting', () => {
    const onClose = jest.fn();
    render(
      <EpisodeDetailDialog
        entry={timelineEntry}
        meds={[]}
        onClose={onClose}
        onEdit={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mutations.deleteEntry.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Delete this log?')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
    expect(mutations.deleteEntry.mutate).toHaveBeenCalledWith(
      'ep-2',
      expect.any(Object)
    );
  });

  it('can back out of a delete', () => {
    render(
      <EpisodeDetailDialog
        entry={timelineEntry}
        meds={[]}
        onClose={jest.fn()}
        onEdit={jest.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete this log?')).not.toBeInTheDocument();
    expect(mutations.deleteEntry.mutate).not.toHaveBeenCalled();
  });

  it('hands the entry to edit', () => {
    const onEdit = jest.fn();
    render(
      <EpisodeDetailDialog
        entry={timelineEntry}
        meds={[]}
        onClose={jest.fn()}
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(timelineEntry);
  });
});

describe('ManageSymptomsDialog', () => {
  const open = () =>
    render(<ManageSymptomsDialog open onOpenChange={jest.fn()} />);

  it('saves a built-in as a pinned definition the first time it is pinned', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Pin Nausea' }));
    expect(mutations.createDefinition.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'nausea',
        template: 'gi',
        is_pinned: true,
      })
    );
    expect(mutations.updateDefinition.mutate).not.toHaveBeenCalled();
  });

  it('updates a saved symptom in place when it is pinned or hidden', () => {
    hookState.definitions = [
      makeDefinition({ id: 'def-1', name: 'nausea', display_name: 'Nausea' }),
    ];
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Pin Nausea' }));
    expect(mutations.updateDefinition.mutate).toHaveBeenCalledWith({
      id: 'def-1',
      body: { is_pinned: true },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hide Nausea' }));
    expect(mutations.updateDefinition.mutate).toHaveBeenLastCalledWith({
      id: 'def-1',
      body: { is_archived: true },
    });
  });

  it('brings a hidden symptom back', () => {
    hookState.definitions = [
      makeDefinition({
        id: 'def-2',
        name: 'nausea',
        display_name: 'Nausea',
        is_archived: true,
      }),
    ];
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Show again' }));
    expect(mutations.updateDefinition.mutate).toHaveBeenCalledWith({
      id: 'def-2',
      body: { is_archived: false },
    });
  });

  it('only offers delete for the user’s own symptoms, and asks first', () => {
    hookState.definitions = [
      makeDefinition({ id: 'def-3', name: 'nausea', display_name: 'Nausea' }),
      makeDefinition({
        id: 'def-4',
        name: 'lower_back_pain',
        display_name: 'Lower back pain',
        template: 'pain',
      }),
    ];
    open();
    expect(
      screen.queryByRole('button', { name: 'Delete Nausea' })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete Lower back pain' })
    );
    expect(mutations.deleteDefinition.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mutations.deleteDefinition.mutate).toHaveBeenCalledWith('def-4');
  });

  it('reassures that past logs are kept', () => {
    open();
    expect(
      screen.getByText(/never removes your past logs/)
    ).toBeInTheDocument();
  });

  it('creates a new symptom from the editor', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /New symptom/ }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Lower back pain' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mutations.createDefinition.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'lower_back_pain',
        display_name: 'Lower back pain',
        template: 'generic',
        scale_type: '1-10',
      }),
      expect.any(Object)
    );
  });

  it('does not save a symptom without a name', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /New symptom/ }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('keeps only the differences from the template as section overrides', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /New symptom/ }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Itch' },
    });
    // The generic template asks about triggers; turn that off and photos on.
    fireEvent.click(screen.getByRole('checkbox', { name: 'triggers' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'photos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const body = mutations.createDefinition.mutate.mock.calls[0][0];
    expect(body.sections).toEqual({ triggers: false, photos: true });
  });

  it('turns a field label into a stable key, and keeps keys unique', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /New symptom/ }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Rash' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add a field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a field' }));
    const labels = screen.getAllByLabelText('Label');
    fireEvent.change(labels[0]!, { target: { value: 'Size (cm)' } });
    fireEvent.change(labels[1]!, { target: { value: 'Size (cm)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const keys =
      mutations.createDefinition.mutate.mock.calls[0][0].custom_field_defs.map(
        (d: { key: string }) => d.key
      );
    expect(keys).toEqual(['size_cm', 'size_cm_2']);
  });

  it('hides a built-in choice and removes a custom one from the lists tab', () => {
    hookState.options = [
      makeOption({ id: 'o-1', kind: 'trigger', name: 'Cold air' }),
    ];
    open();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Choices' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Choices' }));
    const switches = screen.getAllByRole('switch', { name: 'Show Caffeine' });
    fireEvent.click(switches[0]!);
    expect(mutations.createOption.mutate).toHaveBeenCalledWith({
      kind: 'trigger',
      name: 'Caffeine',
      is_hidden: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Cold air' }));
    expect(mutations.deleteOption.mutate).toHaveBeenCalledWith('o-1');
  });
});

describe('SymptomsHub', () => {
  const renderHub = (
    props: Partial<React.ComponentProps<typeof SymptomsHub>> = {}
  ) =>
    render(
      <SymptomsHub
        selectedDate={SELECTED}
        onDateChange={jest.fn()}
        meds={[]}
        {...props}
      />
    );

  it('shows no banner when nothing is running', () => {
    renderHub();
    expect(screen.queryByText('ongoing')).not.toBeInTheDocument();
  });

  it('shows a banner for each running episode', () => {
    hookState.ongoing = [ongoingEpisode];
    renderHub();
    expect(screen.getByText(/started 09:00/)).toBeInTheDocument();
    expect(screen.getByText('2 h 15 m')).toBeInTheDocument();
  });

  it('marks a day symptom-free, and undoes it', () => {
    const { unmount } = renderHub();
    fireEvent.click(screen.getByRole('button', { name: 'No symptoms' }));
    expect(mutations.markFree.mutate).toHaveBeenCalledWith(SELECTED);
    unmount();

    hookState.freeDays = [{ id: 'f', entry_date: SELECTED }];
    renderHub();
    expect(screen.getByText(/symptom-free day/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'No symptoms' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(mutations.unmarkFree.mutate).toHaveBeenCalledWith(SELECTED);
  });

  it('asks about a past day by its date', () => {
    renderHub({ selectedDate: '2026-09-20' });
    expect(screen.getByText('Any symptoms on 2026-09-20?')).toBeInTheDocument();
  });

  it('offers recent symptoms to log again, and starts the form on one', () => {
    hookState.entries = [
      makeEntry({
        symptom_name_snapshot: 'Nausea',
        logged_at: '2026-09-28T09:00:00Z',
      }),
    ];
    renderHub();
    fireEvent.click(screen.getByRole('button', { name: 'Nausea' }));
    // Nausea is a quick log, so the form's action is plain "Save".
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('puts pinned symptoms first among the quick chips', () => {
    hookState.definitions = [
      makeDefinition({
        id: 'd',
        name: 'back_pain',
        display_name: 'Back pain',
        is_pinned: true,
      }),
    ];
    hookState.entries = [
      makeEntry({
        symptom_name_snapshot: 'Nausea',
        logged_at: '2026-09-28T09:00:00Z',
      }),
    ];
    renderHub();
    const chips = screen
      .getAllByRole('button')
      .filter((b) => ['Back pain', 'Nausea'].includes(b.textContent ?? ''));
    expect(chips.map((b) => b.textContent)).toEqual(['Back pain', 'Nausea']);
  });

  it('opens an entry from the history', () => {
    hookState.entries = [
      makeEntry({ symptom_name_snapshot: 'Back pain', context_text: 'Twinge' }),
    ];
    renderHub();
    fireEvent.click(
      screen.getByRole('button', { name: /Back pain.*2026-09-29/ })
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Twinge')).toBeInTheDocument();
  });

  it('opens Manage', () => {
    renderHub();
    fireEvent.click(screen.getByRole('button', { name: /Manage/ }));
    expect(screen.getByText('Manage symptoms')).toBeInTheDocument();
  });

  it('uses the plain calendar on Check-in and the dose calendar with medications', () => {
    const { unmount } = renderHub();
    expect(screen.queryByTestId('medication-calendar')).not.toBeInTheDocument();
    expect(screen.getByText(/September 2026/)).toBeInTheDocument();
    unmount();
    renderHub({ variant: 'medications' });
    expect(screen.getByTestId('medication-calendar')).toBeInTheDocument();
  });

  it('opens the edit form for an entry chosen from the detail view', () => {
    hookState.entries = [makeEntry({ id: 'e-5', symptom_id: 'def-1' })];
    renderHub();
    fireEvent.click(
      screen.getByRole('button', { name: /Migraine.*2026-09-29/ })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('Edit symptom log')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });
});

void ID;
