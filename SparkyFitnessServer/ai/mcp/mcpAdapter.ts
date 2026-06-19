import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolCallOptions } from 'ai';
import { buildChatbotTools } from '../tools/index.js';

// Registry handlers read only rawArgs (no abortSignal/messages), so a stub
// satisfies the execute() signature.
const EXEC_STUB: ToolCallOptions = { toolCallId: 'mcp', messages: [] };

// The slice of an AI-SDK tool() this adapter uses; inputSchema is the bare
// zod-4 object and execute returns a plain string by the registry contract.
interface RegistryTool {
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute?: (args: unknown, options: ToolCallOptions) => Promise<any> | any;
}

// Re-publishes the in-process chatbot tool registry as MCP tools, reusing each
// tool's zod-4 schema and execute() so MCP clients and the chatbot share one
// surface with identical output text.
export function registerRegistryTools(
  mcpServer: McpServer,
  userId: string,
  tz: string
): void {
  const tools = buildChatbotTools(userId, tz) as unknown as Record<
    string,
    RegistryTool
  >;
  for (const [name, t] of Object.entries(tools)) {
    mcpServer.registerTool(
      name,
      // registerTool validates args against this flat schema, then execute()
      // re-parses with its strict per-action union — double-validation is fine.
      { description: t.description, inputSchema: t.inputSchema },
      async (args: unknown) => {
        const out = await t.execute!(args, EXEC_STUB);
        // Registry handlers return plain strings; guard anyway.
        const text = typeof out === 'string' ? out : JSON.stringify(out);
        return { content: [{ type: 'text' as const, text }] };
      }
    );
  }
}
