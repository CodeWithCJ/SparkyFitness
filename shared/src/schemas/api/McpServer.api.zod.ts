import { z } from 'zod';
import {
  MCP_SERVER_MAX_TOOLS,
  MCP_SERVER_TOOL_NAME_MAX_LENGTH,
  MCP_SERVER_TOOL_PROBLEMS,
} from '../../constants/mcpServerProviderTypes.ts';

export const mcpServerOptionsSchema = z
  .object({
    allowed_tools: z
      .array(z.string().trim().min(1).max(MCP_SERVER_TOOL_NAME_MAX_LENGTH))
      .max(MCP_SERVER_MAX_TOOLS),
    send_user_id: z.boolean(),
  })
  .strict();

export type McpServerOptions = z.infer<typeof mcpServerOptionsSchema>;

// An admin asking an MCP tool server for its tools, to choose which chat may
// use. Without a token, a saved server's stored one is used only at its saved URL.
export const mcpServerToolsRequestSchema = z
  .object({
    base_url: z.string().trim().min(1).max(2048),
    app_key: z.string().trim().max(4096).optional(),
    provider_id: z.uuid().optional(),
  })
  .strict();

export type McpServerToolsRequest = z.infer<typeof mcpServerToolsRequestSchema>;

export const mcpServerToolChoiceSchema = z.object({
  name: z.string(),
  description: z.string(),
  // Why chat would leave this tool out, or null when it can use it.
  problem: z.enum(MCP_SERVER_TOOL_PROBLEMS).nullable(),
});

export type McpServerToolChoice = z.infer<typeof mcpServerToolChoiceSchema>;

export const mcpServerToolsResponseSchema = z.object({
  tools: z.array(mcpServerToolChoiceSchema),
});

export type McpServerToolsResponse = z.infer<
  typeof mcpServerToolsResponseSchema
>;
