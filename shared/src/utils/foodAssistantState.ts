import type {
  FoodAssistantPreference,
  FoodAssistantTask,
} from "../schemas/database/FoodAssistant.zod.ts";
export type FoodAssistantStateAction =
  | { action: "edit"; preference: FoodAssistantPreference; value: string }
  | { action: "forget"; preference: FoodAssistantPreference }
  | { action: "cancel" | "resume"; task: FoodAssistantTask };

/** Web and mobile dispatch the same versioned state actions through their
 * authenticated transports. Cache refresh and chat presentation stay local. */
export async function executeFoodAssistantStateAction(
  input: FoodAssistantStateAction,
  adapter: {
    edit: (
      preference: FoodAssistantPreference,
      value: string,
    ) => Promise<unknown>;
    forget: (preference: FoodAssistantPreference) => Promise<unknown>;
    change: (
      task: FoodAssistantTask,
      action: "cancel" | "resume",
    ) => Promise<unknown>;
  },
) {
  if (input.action === "edit")
    await adapter.edit(input.preference, input.value);
  else if (input.action === "forget") await adapter.forget(input.preference);
  else await adapter.change(input.task, input.action);
}
