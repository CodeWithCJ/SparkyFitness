import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolCallOptions } from 'ai';
import { buildChatbotTools } from '../tools/index.js';

/**
 * Minimal AI-SDK tool-execution options. Every registry handler reads only its
 * single rawArgs argument — none touch abortSignal or the message list — so an
 * empty toolCallId/messages pair is enough to satisfy the execute() signature.
 */
const EXEC_STUB: ToolCallOptions = { toolCallId: 'mcp', messages: [] };

/**
 * The slice of an AI-SDK tool() object this adapter consumes. inputSchema is
 * the bare zod-4 object (tool() is an identity passthrough), and execute
 * returns a plain string by the registry contract.
 */
interface RegistryTool {
  description?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute?: (args: unknown, options: ToolCallOptions) => Promise<any> | any;
}

/**
 * Bridges the in-process chatbot tool registry onto an MCP server. Each AI-SDK
 * tool() is re-published as an MCP tool reusing the same zod-4 input schema and
 * execute() handler, so external MCP clients and the chatbot share one tool
 * surface and produce byte-identical output text.
 */
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
      // The bare zod-4 object goes straight through; MCP 1.29's zod-compat
      // accepts zod v4. registerTool validates args against this advisory flat
      // schema before the handler runs, then execute() re-parses with its
      // strict per-action union — the double-validation is harmless.
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
