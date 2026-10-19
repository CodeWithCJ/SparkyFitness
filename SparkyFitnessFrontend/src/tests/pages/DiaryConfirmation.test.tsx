import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DiaryConfirmation from '@/pages/Diary/DiaryConfirmation';
import { apiCall } from '@/api/api';
jest.mock('@/api/api', () => ({ apiCall: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const id = 'fd7accb6-1fbb-400e-80c3-c16808ab7772';
const fingerprint = 'a'.repeat(64);
const command = {
  operation_id: id,
  expected_version: 1,
  action: {
    type: 'delete',
    scope: { type: 'entries', ids: [id] },
    expected_fingerprint: fingerprint,
    confirmation_quote: 'Confirm deletion of these diary entries.',
  },
};
const entry = {
  id,
  food_name: 'Chicken',
  quantity: 100,
  unit: 'g',
  entry_date: '2026-10-16',
};
const task = {
  id,
  user_id: id,
  kind: 'diary',
  title: 'Lunch',
  status: 'draft',
  checkpoint: { summary: 'Lunch', ingredients: [] },
  creation_hash: 'test',
  version: 1,
  result: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
function openPage() {
  const hash = encodeURIComponent(
    JSON.stringify({ action: 'apply', task_id: id, command })
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[`/diary-confirmation#${hash}`]}>
        <DiaryConfirmation />
      </MemoryRouter>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(apiCall)
    .mockImplementation(async (endpoint) =>
      endpoint.endsWith('/inspect')
        ? { entries: [entry], fingerprint }
        : endpoint.includes('/tasks/')
          ? task
          : {}
    );
});
it('previews the exact entries and sends no mutation until the owner presses Confirm', async () => {
  let applied = false;
  jest.mocked(apiCall).mockImplementation(async (endpoint) => {
    if (endpoint.includes('/diary/apply/')) {
      applied = true;
      return {};
    }
    if (endpoint.endsWith('/inspect')) return { entries: [entry], fingerprint };
    return { ...task, version: applied ? 2 : 1 };
  });
  openPage();
  expect(await screen.findByText(/Chicken/)).toBeInTheDocument();
  expect(
    jest
      .mocked(apiCall)
      .mock.calls.some(([endpoint]) => endpoint.includes('/diary/apply/'))
  ).toBe(false);
  fireEvent.click(
    screen.getByRole('button', { name: 'foodAssistant.confirmDelete' })
  );
  await waitFor(() =>
    expect(apiCall).toHaveBeenCalledWith(
      `/v2/food-assistant/diary/apply/${id}`,
      { method: 'POST', body: command }
    )
  );
  expect(await screen.findByRole('status')).toHaveTextContent(
    'foodAssistant.confirmationDone'
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('refuses a changed preview before offering a confirmation button', async () => {
  jest
    .mocked(apiCall)
    .mockImplementation(async (endpoint) =>
      endpoint.endsWith('/inspect')
        ? { entries: [entry], fingerprint: 'b'.repeat(64) }
        : task
    );
  openPage();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'foodAssistant.confirmationChanged'
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
