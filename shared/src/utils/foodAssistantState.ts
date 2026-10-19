import type {
  FoodAssistantPreference,
  FoodAssistantTask,
} from "../schemas/database/FoodAssistant.zod.ts";
export type FoodAssistantStateAction =
  | { action: "edit"; preference: FoodAssistantPreference; value: string }
  | { action: "forget"; preference: FoodAssistantPreference }
  | { action: "cancel" | "resume"; task: FoodAssistantTask }
  | {
      action: "mark_shopping";
      task: FoodAssistantTask;
      itemId: string;
      purchased: boolean;
    };

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
    markShopping: (
      task: FoodAssistantTask,
      itemId: string,
      purchased: boolean,
    ) => Promise<unknown>;
    change: (
      task: FoodAssistantTask,
      action: "cancel" | "resume",
    ) => Promise<unknown>;
  },
) {
  if (input.action === "edit")
    await adapter.edit(input.preference, input.value);
  else if (input.action === "forget") await adapter.forget(input.preference);
  else if (input.action === "mark_shopping")
    await adapter.markShopping(input.task, input.itemId, input.purchased);
  else await adapter.change(input.task, input.action);
}
