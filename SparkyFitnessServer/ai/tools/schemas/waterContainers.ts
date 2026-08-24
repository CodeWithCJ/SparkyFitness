import { z } from 'zod';

// Water containers are user-defined reusable vessels (name + volume + unit)
// used for quick water logging. Volume is stored in ml after unit conversion.
export const WATER_CONTAINER_ACTIONS = [
  'list_water_containers',
  'get_water_container',
  'create_water_container',
  'update_water_container',
  'delete_water_container',
  'set_primary_water_container',
] as const;

const WATER_CONTAINER_UNITS = ['ml', 'oz', 'liter'] as const;

const containerIdSchema = z.coerce
  .number()
  .int()
  .positive('Water container ID must be a positive integer');

const containerNameSchema = z
  .string()
  .trim()
  .min(1, 'Container name is required')
  .max(255, 'Container name must be 255 characters or fewer');

const volumeSchema = z
  .number()
  .min(0.001, 'Volume must be greater than 0')
  .max(9999.999, 'Volume is too large');

const unitSchema = z.enum(WATER_CONTAINER_UNITS);

const servingsSchema = z
  .number()
  .int()
  .min(1, 'Servings per container must be at least 1');

const listWaterContainersSchema = z
  .object({
    action: z.literal('list_water_containers'),
  })
  .strict();

const getWaterContainerSchema = z
  .object({
    action: z.literal('get_water_container'),
    id: containerIdSchema.describe('ID of the water container'),
  })
  .strict();

const createWaterContainerSchema = z
  .object({
    action: z.literal('create_water_container'),
    name: containerNameSchema,
    volume: volumeSchema,
    unit: unitSchema,
    is_primary: z.boolean().optional(),
    servings_per_container: servingsSchema.optional(),
  })
  .strict();

const updateWaterContainerSchema = z
  .object({
    action: z.literal('update_water_container'),
    id: containerIdSchema.describe('ID of the water container to update'),
    name: containerNameSchema.optional(),
    volume: volumeSchema.optional(),
    unit: unitSchema.optional(),
    is_primary: z.boolean().optional(),
    servings_per_container: servingsSchema.optional(),
  })
  .strict();

const deleteWaterContainerSchema = z
  .object({
    action: z.literal('delete_water_container'),
    id: containerIdSchema.describe('ID of the water container to delete'),
  })
  .strict();

const setPrimaryWaterContainerSchema = z
  .object({
    action: z.literal('set_primary_water_container'),
    id: containerIdSchema.describe(
      'ID of the water container to mark as primary'
    ),
  })
  .strict();

export const manageWaterContainersSchema = z.discriminatedUnion('action', [
  listWaterContainersSchema,
  getWaterContainerSchema,
  createWaterContainerSchema,
  updateWaterContainerSchema,
  deleteWaterContainerSchema,
  setPrimaryWaterContainerSchema,
]);

export type ManageWaterContainersInput = z.infer<
  typeof manageWaterContainersSchema
>;

// Flat shape published to the LLM as `inputSchema`. Strict per-action
// validation still runs in the tool handler via safeParse.
export const manageWaterContainersInput = z.object({
  action: z
    .enum(WATER_CONTAINER_ACTIONS)
    .optional()
    .describe(
      'Action to perform; see the tool description for the fields each action needs.'
    ),
  id: containerIdSchema
    .optional()
    .describe('get/update/delete/set_primary: ID of the water container'),
  name: containerNameSchema
    .optional()
    .describe('create/update: container display name'),
  volume: volumeSchema
    .optional()
    .describe('create/update: container volume in the given unit'),
  unit: unitSchema
    .optional()
    .describe('create/update: volume unit (ml, oz, or liter)'),
  is_primary: z
    .boolean()
    .optional()
    .describe('create/update: mark this container as the primary one'),
  servings_per_container: servingsSchema
    .optional()
    .describe('create/update: number of servings a full container provides'),
});
