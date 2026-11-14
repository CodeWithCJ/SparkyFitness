// The external provider that gives chat tools from an outside MCP server: an
// `external_data_providers` row of this type, which only an admin can add, as
// a global provider. Its `provider_options` say which tools chat may use.
export const MCP_SERVER_PROVIDER_TYPE = 'mcp_server';

// Every allowed tool's schema is sent with every chat request, so this bounds
// what an outside server can add to token use.
export const MCP_SERVER_MAX_TOOLS = 20;

// The header that tells an outside server who is chatting, when the admin has
// turned that on for the server. It carries the signed-in person's user ID.
export const MCP_SERVER_USER_ID_HEADER = 'X-SparkyFitness-User-Id';

export const MCP_SERVER_TOOL_NAME_MAX_LENGTH = 128;

export const MCP_SERVER_TOOL_PROBLEMS = [
  'not_object',
  'too_deep',
  'malformed',
  'unreadable',
  'too_large',
  'contains_token',
  'name_too_long',
  'name_blank_or_padded',
] as const;

export const MCP_SERVER_LIST_TIMEOUT_MS = 5_000;
