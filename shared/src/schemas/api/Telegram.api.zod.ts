import { z } from 'zod';

export const TelegramWebhookSchema = z.object({
  update_id: z.number(),
  message: z.object({
    message_id: z.number(),
    from: z.object({
      id: z.number(),
      is_bot: z.boolean(),
      first_name: z.string(),
      last_name: z.string().optional(),
      username: z.string().optional(),
      language_code: z.string().optional(),
    }).optional(),
    chat: z.object({
      id: z.number(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      username: z.string().optional(),
      type: z.string(),
    }),
    date: z.number(),
    text: z.string().optional(),
    entities: z.array(z.object({
      offset: z.number(),
      length: z.number(),
      type: z.string(),
    })).optional(),
  }).optional(),
  callback_query: z.object({
    id: z.string(),
    from: z.object({
      id: z.number(),
      is_bot: z.boolean(),
      first_name: z.string(),
    }),
    message: z.object({
      message_id: z.number(),
      chat: z.object({
        id: z.number(),
      }),
      text: z.string().optional(),
    }).optional(),
    data: z.string(),
  }).optional(),
});
