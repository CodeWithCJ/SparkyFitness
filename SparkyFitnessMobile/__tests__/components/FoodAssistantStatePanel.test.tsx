import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '../hooks/queryTestUtils';
import {
  foodAssistantTaskSchema,
  foodAssistantPreferenceSchema,
} from '@workspace/shared';
import FoodAssistantStatePanel from '../../src/components/chat/FoodAssistantStatePanel';
import * as api from '../../src/services/api/foodAssistantApi';

const mockAppend = jest.fn();
jest.mock('@assistant-ui/react-native', () => ({
  useAui: () => ({ thread: () => ({ append: mockAppend }) }),
  useAuiState: () => false,
}));
jest.mock('../../src/services/api/foodAssistantApi', () => ({
  loadAssistantPreferences: jest.fn(),
  loadAssistantTasks: jest.fn(),
  loadAssistantOperations: jest.fn(),
  editAssistantPreference: jest.fn(),
  forgetAssistantPreference: jest.fn(),
  changeAssistantTask: jest.fn(),
}));
const preference = foodAssistantPreferenceSchema.parse({
  user_id: 'f2567f49-14ae-4c4e-af61-fa60293b78a4',
  key: 'avoid_nuts',
  value: 'Avoid nuts',
  source_quote: 'Always avoid nuts',
  version: 2,
  created_at: new Date(),
  updated_at: new Date(),
});
const task = foodAssistantTaskSchema.parse({
  id: 'eea6106b-1f1b-48c5-8a36-a7c348e453bf',
  user_id: 'f2567f49-14ae-4c4e-af61-fa60293b78a4',
  kind: 'recipe',
  title: 'Recipe draft',
  status: 'awaiting_input',
  version: 4,
  creation_hash: 'test',
  checkpoint: {
    summary: 'Need the yield',
    ingredients: [
      {
        id: '63fb8f2b-d77d-4b15-b248-e016e28c55d9',
        description: 'Unreadable ingredient',
        status: 'unresolved',
      },
    ],
  },
  result: null,
  created_at: new Date(),
  updated_at: new Date(),
});
const clients: ReturnType<typeof createTestQueryClient>[] = [];
function mount() {
  const client = createTestQueryClient();
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <FoodAssistantStatePanel />
    </QueryClientProvider>
  );
}
afterEach(() => clients.splice(0).forEach((client) => client.clear()));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.loadAssistantPreferences).mockResolvedValue([preference]);
  jest.mocked(api.loadAssistantTasks).mockResolvedValue([task]);
  jest.mocked(api.loadAssistantOperations).mockResolvedValue([]);
});
it('loads private state only when opened and exposes every unresolved ingredient', async () => {
  const view = mount();
  expect(api.loadAssistantPreferences).not.toHaveBeenCalled();
  fireEvent.press(view.getByText('Food preferences and tasks'));
  await waitFor(() => expect(view.getByText('Recipe draft')).toBeTruthy());
  fireEvent.press(view.getByText('Recipe draft'));
  await waitFor(() =>
    expect(view.getByText(/Unreadable ingredient/)).toBeTruthy()
  );
  expect(view.getByText('Need the yield')).toBeTruthy();
});
it('forgets the actual preference version and resumes the current task in chat', async () => {
  const view = mount();
  fireEvent.press(view.getByText('Food preferences and tasks'));
  await waitFor(() => expect(view.getByText('Forget')).toBeTruthy());
  fireEvent.press(view.getByText('Forget'));
  await waitFor(() =>
    expect(api.forgetAssistantPreference).toHaveBeenCalledWith(preference)
  );
  fireEvent.press(view.getByText('Resume in chat'));
  await waitFor(() =>
    expect(api.changeAssistantTask).toHaveBeenCalledWith(task, 'resume')
  );
  await waitFor(() =>
    expect(mockAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        content: [
          expect.objectContaining({ text: expect.stringContaining(task.id) }),
        ],
      })
    )
  );
});
