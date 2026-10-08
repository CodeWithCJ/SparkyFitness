import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithClient } from '@/tests/test-utils';
import { FoodAssistantState } from '@/components/ai/FoodAssistantState';
import * as api from '@/api/Chatbot/foodAssistantService';
import {
  foodAssistantTaskSchema,
  foodAssistantPreferenceSchema,
} from '@workspace/shared';
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'owner' } }),
}));
jest.mock('@/api/Chatbot/foodAssistantService', () => ({
  loadFoodAssistantPreferences: jest.fn(),
  loadFoodAssistantTasks: jest.fn(),
  loadFoodAssistantOperations: jest.fn(),
  editFoodAssistantPreference: jest.fn(),
  forgetFoodAssistantPreference: jest.fn(),
  changeFoodAssistantTask: jest.fn(),
}));
const id = 'd3ebfc08-7f2e-4736-8b08-b8a0cbac2d17';
const owner = '191d765e-f283-4b98-ae69-011e9c33759e';
const task = foodAssistantTaskSchema.parse({
  id,
  user_id: owner,
  kind: 'recipe',
  title: 'Bread draft',
  creation_hash: 'hash',
  status: 'awaiting_input',
  checkpoint: {
    summary: 'Need the flour label',
    ingredients: [
      {
        id,
        description: 'Flour',
        quantity: 250,
        unit: 'g',
        status: 'unresolved',
      },
    ],
  },
  result: null,
  version: 2,
  created_at: new Date(),
  updated_at: new Date(),
});
const preference = foodAssistantPreferenceSchema.parse({
  user_id: owner,
  key: 'bread',
  value: 'White bread',
  source_quote: 'Remember white bread',
  version: 3,
  created_at: new Date(),
  updated_at: new Date(),
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.loadFoodAssistantPreferences).mockResolvedValue([preference]);
  jest.mocked(api.loadFoodAssistantTasks).mockResolvedValue([task]);
  jest.mocked(api.loadFoodAssistantOperations).mockResolvedValue([]);
});
it('edits and forgets the current preference with its version', async () => {
  renderWithClient(<FoodAssistantState onResume={jest.fn()} />);
  fireEvent.click(screen.getByText('Food preferences and tasks'));
  await screen.findByText('White bread');
  fireEvent.click(screen.getByText('Edit'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Preference' }), {
    target: { value: 'Wholemeal bread' },
  });
  fireEvent.click(screen.getByText('Save'));
  await waitFor(() =>
    expect(api.editFoodAssistantPreference).toHaveBeenCalledWith(
      preference,
      'Wholemeal bread'
    )
  );
  fireEvent.click(screen.getByText('Forget'));
  await waitFor(() =>
    expect(api.forgetFoodAssistantPreference).toHaveBeenCalledWith(preference)
  );
});
it('shows the unresolved ingredient and resumes only after the server accepts', async () => {
  const onResume = jest.fn();
  renderWithClient(<FoodAssistantState onResume={onResume} />);
  fireEvent.click(screen.getByText('Food preferences and tasks'));
  fireEvent.click(await screen.findByText('Bread draft'));
  await screen.findByText('Need the flour label');
  expect(screen.getByText(/250 g Flour/).textContent).toContain('unresolved');
  fireEvent.click(screen.getByText('Resume in chat'));
  await waitFor(() =>
    expect(api.changeFoodAssistantTask).toHaveBeenCalledWith(task, 'resume')
  );
  await waitFor(() => expect(onResume).toHaveBeenCalledWith(id));
});
it('does not continue a task when a version conflict is returned', async () => {
  jest
    .mocked(api.changeFoodAssistantTask)
    .mockRejectedValueOnce(new Error('changed'));
  const onResume = jest.fn();
  renderWithClient(<FoodAssistantState onResume={onResume} />);
  fireEvent.click(screen.getByText('Food preferences and tasks'));
  fireEvent.click(await screen.findByText('Resume in chat'));
  await screen.findByRole('alert');
  expect(onResume).not.toHaveBeenCalled();
});
