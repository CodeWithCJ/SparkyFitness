// The external provider that gives chat tools from an outside MCP server: an
// `external_data_providers` row of this type, which only an admin can add, as
// a global provider. Its `provider_options` say which tools chat may use.
export const MCP_SERVER_PROVIDER_TYPE = 'mcp_server';

// Every allowed tool's schema is sent with every chat request, so this bounds
// what an outside server can add to token use.
export const MCP_SERVER_MAX_TOOLS = 20;
