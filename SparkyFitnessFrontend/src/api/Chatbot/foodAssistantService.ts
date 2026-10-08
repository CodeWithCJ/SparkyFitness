import { apiCall } from '@/api/api';
import {
  foodAssistantPreferenceSchema,
  foodAssistantTaskSchema,
  foodAssistantOperationSchema,
  type FoodAssistantPreference,
  type FoodAssistantTask,
} from '@workspace/shared';

export const loadFoodAssistantPreferences = async () =>
  foodAssistantPreferenceSchema
    .array()
    .parse(await apiCall('/v2/food-assistant/preferences'));
export const loadFoodAssistantTasks = async () =>
  foodAssistantTaskSchema
    .array()
    .parse(await apiCall('/v2/food-assistant/tasks'));
export const loadFoodAssistantOperations = async (taskId: string) =>
  foodAssistantOperationSchema
    .array()
    .parse(await apiCall(`/v2/food-assistant/tasks/${taskId}/operations`));

export const editFoodAssistantPreference = async (
  preference: FoodAssistantPreference,
  value: string
) =>
  foodAssistantPreferenceSchema.parse(
    await apiCall('/v2/food-assistant/preferences', {
      method: 'PUT',
      body: {
        key: preference.key,
        value,
        expected_version: preference.version,
      },
    })
  );
export const forgetFoodAssistantPreference = async (
  preference: FoodAssistantPreference
) => {
  await apiCall(
    `/v2/food-assistant/preferences/${encodeURIComponent(preference.key)}?version=${preference.version}`,
    { method: 'DELETE' }
  );
};
export const changeFoodAssistantTask = async (
  task: FoodAssistantTask,
  action: 'cancel' | 'resume'
) => {
  await apiCall(`/v2/food-assistant/tasks/${task.id}/${action}`, {
    method: 'POST',
    body: { operation_id: crypto.randomUUID(), expected_version: task.version },
  });
};
