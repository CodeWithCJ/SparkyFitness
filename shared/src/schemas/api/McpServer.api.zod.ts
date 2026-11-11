import { z } from 'zod';
import { MCP_SERVER_MAX_TOOLS } from '../../constants/mcpServerProviderTypes.ts';

export const mcpServerOptionsSchema = z
  .object({
    allowed_tools: z
      .array(z.string().trim().min(1).max(128))
      .max(MCP_SERVER_MAX_TOOLS),
    send_user_id: z.boolean(),
  })
  .strict();

export type McpServerOptions = z.infer<typeof mcpServerOptionsSchema>;
