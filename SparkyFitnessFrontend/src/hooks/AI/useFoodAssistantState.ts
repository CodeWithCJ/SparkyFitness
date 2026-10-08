import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  loadFoodAssistantPreferences,
  loadFoodAssistantTasks,
  loadFoodAssistantOperations,
  editFoodAssistantPreference,
  forgetFoodAssistantPreference,
  changeFoodAssistantTask,
} from '@/api/Chatbot/foodAssistantService';
import type {
  FoodAssistantPreference,
  FoodAssistantTask,
} from '@workspace/shared';

type StateAction =
  | { action: 'edit'; preference: FoodAssistantPreference; value: string }
  | { action: 'forget'; preference: FoodAssistantPreference }
  | { action: 'cancel' | 'resume'; task: FoodAssistantTask };

export function useFoodAssistantState(
  open: boolean,
  selectedId: string | undefined,
  onResume: (taskId: string) => void
) {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = ['foodAssistant', user?.id];
  const preferences = useQuery({
    queryKey: [...key, 'preferences'],
    queryFn: loadFoodAssistantPreferences,
    enabled: open && !!user,
  });
  const tasks = useQuery({
    queryKey: [...key, 'tasks'],
    queryFn: loadFoodAssistantTasks,
    enabled: open && !!user,
  });
  const operations = useQuery({
    queryKey: [...key, 'operations', selectedId],
    queryFn: () => loadFoodAssistantOperations(selectedId!),
    enabled: open && !!user && !!selectedId,
  });
  const mutation = useMutation({
    mutationFn: async (input: StateAction) => {
      if (input.action === 'edit')
        await editFoodAssistantPreference(input.preference, input.value);
      else if (input.action === 'forget')
        await forgetFoodAssistantPreference(input.preference);
      else await changeFoodAssistantTask(input.task, input.action);
    },
    onSuccess: async (_data, input) => {
      await client.invalidateQueries({ queryKey: key });
      if (input.action === 'resume') onResume(input.task.id);
    },
  });
  return { preferences, tasks, operations, mutation };
}
