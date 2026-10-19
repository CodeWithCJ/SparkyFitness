import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  executeFoodAssistantStateAction,
  type FoodAssistantStateAction,
} from '@workspace/shared';
import {
  loadAssistantPreferences,
  loadAssistantTasks,
  loadAssistantOperations,
  editAssistantPreference,
  forgetAssistantPreference,
  changeAssistantTask,
  markAssistantShopping,
} from '../services/api/foodAssistantApi';
const key = ['foodAssistant'];
export function useFoodAssistantState(
  open: boolean,
  selectedId: string | undefined,
  onResume: (id: string) => void
) {
  const client = useQueryClient();
  const preferences = useQuery({
    queryKey: [...key, 'preferences'],
    queryFn: loadAssistantPreferences,
    enabled: open,
    gcTime: 0,
    retry: 1,
  });
  const tasks = useQuery({
    queryKey: [...key, 'tasks'],
    queryFn: loadAssistantTasks,
    enabled: open,
    gcTime: 0,
    retry: 1,
  });
  const operations = useQuery({
    queryKey: [...key, 'operations', selectedId],
    queryFn: () => loadAssistantOperations(selectedId!),
    enabled: open && !!selectedId,
    gcTime: 0,
    retry: 1,
  });
  const mutation = useMutation({
    mutationFn: (input: FoodAssistantStateAction) =>
      executeFoodAssistantStateAction(input, {
        edit: editAssistantPreference,
        forget: forgetAssistantPreference,
        change: changeAssistantTask,
        markShopping: markAssistantShopping,
      }),
    onSuccess: async (_data, input) => {
      await client.invalidateQueries({ queryKey: key });
      if (input.action === 'resume') onResume(input.task.id);
    },
    onError: async () => {
      await client.invalidateQueries({ queryKey: key });
    },
  });
  return { preferences, tasks, operations, mutation };
}
