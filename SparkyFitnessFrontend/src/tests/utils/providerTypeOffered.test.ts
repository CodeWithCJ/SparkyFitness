import { isProviderTypeOffered } from '@/utils/settings';

describe('isProviderTypeOffered', () => {
  const mcpServer = { id: 'mcp_server', is_strictly_private: true };
  const personal = { id: 'garmin', is_strictly_private: true };
  const shared = { id: 'usda', is_strictly_private: false };

  it('offers an MCP tool server to the admin form only', () => {
    expect(isProviderTypeOffered(mcpServer, true)).toBe(true);
    expect(isProviderTypeOffered(mcpServer, false)).toBe(false);
  });

  it('keeps other strictly private types out of the admin form only', () => {
    expect(isProviderTypeOffered(personal, true)).toBe(false);
    expect(isProviderTypeOffered(personal, false)).toBe(true);
    expect(isProviderTypeOffered(shared, true)).toBe(true);
    expect(isProviderTypeOffered(shared, false)).toBe(true);
  });
});
