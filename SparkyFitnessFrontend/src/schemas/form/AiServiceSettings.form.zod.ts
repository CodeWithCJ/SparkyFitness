import {
  createAiServiceSettingsRequestSchema,
  updateAiServiceSettingsRequestSchema,
} from '@workspace/shared';
import { z } from 'zod';

export const createAiServiceSettingsFormSchema =
  createAiServiceSettingsRequestSchema
    .extend({
      showCustomModelInput: z.boolean().optional().default(false),
      custom_model_name: z.string().optional().default(''),
    })
    .transform(({ showCustomModelInput, custom_model_name, ...rest }) => ({
      ...rest,
      model_name: showCustomModelInput ? custom_model_name : rest.model_name,
    }));

export const updateAiServiceSettingsFormSchema =
  updateAiServiceSettingsRequestSchema
    .extend({
      showCustomModelInput: z.boolean().optional().default(false),
      custom_model_name: z.string().optional().default(''),
    })
    .transform(({ showCustomModelInput, custom_model_name, ...rest }) => ({
      ...rest,
      model_name: showCustomModelInput ? custom_model_name : rest.model_name,
    }));

// Input types (what the form state holds)
export type CreateAiServiceSettingsFormInput = z.input<
  typeof createAiServiceSettingsFormSchema
>;
export type UpdateAiServiceSettingsFormInput = z.input<
  typeof updateAiServiceSettingsFormSchema
>;
