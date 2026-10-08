import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  loadFoodAssistantPreferences,
  loadFoodAssistantTasks,
  loadFoodAssistantOperations,
  editFoodAssistantPreference,
  forgetFoodAssistantPreference,
  changeFoodAssistantTask,
  markFoodAssistantShopping,
} from '@/api/Chatbot/foodAssistantService';
import {
  executeFoodAssistantStateAction,
  type FoodAssistantStateAction,
} from '@workspace/shared';

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
    mutationFn: (input: FoodAssistantStateAction) =>
      executeFoodAssistantStateAction(input, {
        edit: editFoodAssistantPreference,
        forget: forgetFoodAssistantPreference,
        change: changeFoodAssistantTask,
        markShopping: markFoodAssistantShopping,
      }),
    onError: async () => {
      await client.invalidateQueries({ queryKey: key });
    },
    onSuccess: async (_data, input) => {
      await client.invalidateQueries({ queryKey: key });
      if (input.action === 'resume') onResume(input.task.id);
    },
  });
  return { preferences, tasks, operations, mutation };
}
