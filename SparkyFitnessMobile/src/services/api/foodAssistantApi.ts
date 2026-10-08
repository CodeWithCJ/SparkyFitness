import {
  foodAssistantPreferenceSchema,
  foodAssistantTaskSchema,
  foodAssistantOperationSchema,
  type FoodAssistantPreference,
  type FoodAssistantTask,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { newUuid } from '../../utils/ids';
const base = '/api/v2/food-assistant';
function request(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
) {
  return apiFetch<unknown>({
    endpoint: `${base}${endpoint}`,
    serviceName: 'Food Assistant API',
    operation: endpoint,
    method,
    body,
  });
}
export async function loadAssistantPreferences() {
  return foodAssistantPreferenceSchema
    .array()
    .parse(await request('/preferences'));
}
export async function loadAssistantTasks() {
  return foodAssistantTaskSchema.array().parse(await request('/tasks'));
}
export async function loadAssistantOperations(id: string) {
  return foodAssistantOperationSchema
    .array()
    .parse(await request(`/tasks/${id}/operations`));
}
export async function editAssistantPreference(
  preference: FoodAssistantPreference,
  value: string
) {
  return foodAssistantPreferenceSchema.parse(
    await request('/preferences', 'PUT', {
      key: preference.key,
      value,
      expected_version: preference.version,
    })
  );
}
export async function forgetAssistantPreference(
  preference: FoodAssistantPreference
) {
  await request(
    `/preferences/${encodeURIComponent(preference.key)}?version=${preference.version}`,
    'DELETE'
  );
}
export async function changeAssistantTask(
  task: FoodAssistantTask,
  action: 'cancel' | 'resume'
) {
  return foodAssistantOperationSchema.parse(
    await request(`/tasks/${task.id}/${action}`, 'POST', {
      operation_id: newUuid(),
      expected_version: task.version,
    })
  );
}
export async function markAssistantShopping(
  task: FoodAssistantTask,
  itemId: string,
  purchased: boolean
) {
  return foodAssistantOperationSchema.parse(
    await request(`/planning/change_shopping_list/${task.id}`, 'POST', {
      operation_id: newUuid(),
      expected_version: task.version,
      change: { type: 'mark', item_id: itemId, purchased },
    })
  );
}
