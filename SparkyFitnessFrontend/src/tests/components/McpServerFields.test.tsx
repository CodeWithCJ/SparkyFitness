import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { apiCall, HttpApiError } from '@/api/api';
import { McpServerFields } from '@/pages/Settings/McpServerFields';
import type { McpServerOptions } from '@workspace/shared';
import { renderWithClient } from '../test-utils';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/api/api', () => ({
  ...jest.requireActual('@/api/api'),
  apiCall: jest.fn(),
}));

const listed = {
  tools: [
    {
      name: 'search',
      fingerprint: 'a'.repeat(64),
      description: 'Searches notes.',
      problem: null,
    },
    {
      name: 'broken',
      fingerprint: 'b'.repeat(64),
      description: 'A careless tool.',
      problem: 'malformed',
    },
  ],
};

let latest: McpServerOptions | undefined;

const Harness = ({
  initial = { allowed_tools: [], send_user_id: false },
  providerId,
  appKey = '',
}: {
  initial?: McpServerOptions;
  providerId?: string;
  appKey?: string;
}) => {
  const [options, setOptions] = useState<McpServerOptions>(initial);
  const [baseUrl, setBaseUrl] = useState('https://tools.example/mcp');
  return (
    <McpServerFields
      idPrefix="test"
      baseUrl={baseUrl}
      appKey={appKey}
      options={options}
      providerId={providerId}
      savedBaseUrl="https://tools.example/mcp"
      onBaseUrlChange={setBaseUrl}
      onAppKeyChange={jest.fn()}
      onOptionsChange={(next) => {
        latest = next;
        setOptions(next);
      }}
    />
  );
};

const loadTools = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Load tools' }));

describe('McpServerFields', () => {
  beforeEach(() => {
    latest = undefined;
    jest.mocked(apiCall).mockReset();
  });

  it('lists the server’s tools and allows the ones the admin ticks', async () => {
    jest.mocked(apiCall).mockResolvedValue(listed);
    renderWithClient(<Harness appKey="typed" />);

    loadTools();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'search' }));

    expect(latest).toEqual({
      allowed_tools: [{ name: 'search', fingerprint: 'a'.repeat(64) }],
      send_user_id: false,
    });
    expect(apiCall).toHaveBeenCalledWith(
      '/admin/external-data-providers/mcp-server/tools',
      expect.objectContaining({
        method: 'POST',
        suppressErrorToast: true,
        body: JSON.stringify({
          base_url: 'https://tools.example/mcp',
          app_key: 'typed',
        }),
      })
    );
    expect(
      screen.getByText('Chat may use 1 of at most 20 tools.')
    ).toBeInTheDocument();
  });

  it('drops the loaded tools once the server URL changes', async () => {
    jest.mocked(apiCall).mockResolvedValue(listed);
    renderWithClient(
      <Harness
        initial={{
          allowed_tools: [{ name: 'search', fingerprint: 'a'.repeat(64) }],
          send_user_id: false,
        }}
      />
    );

    loadTools();
    expect(
      await screen.findByRole('checkbox', { name: 'broken' })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('MCP server URL'), {
      target: { value: 'https://other.example/mcp' },
    });

    expect(
      screen.queryByRole('checkbox', { name: 'broken' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'search' })
    ).not.toBeInTheDocument();
    expect(latest).toEqual({ allowed_tools: [], send_user_id: false });
    expect(screen.queryByText('Searches notes.')).not.toBeInTheDocument();
  });

  it('requires the token again when a saved URL changes, and keeps the hint tied to the saved URL', () => {
    renderWithClient(
      <Harness
        providerId="server-1"
        initial={{
          allowed_tools: [{ name: 'search', fingerprint: 'a'.repeat(64) }],
          send_user_id: true,
        }}
      />
    );
    expect(
      screen.queryByText(
        'Enter the token again when you change the server URL.'
      )
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('MCP server URL'), {
      target: { value: 'https://other.example/mcp' },
    });
    expect(
      screen.getByText('Enter the token again when you change the server URL.')
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Bearer token (optional)')
    ).not.toHaveAttribute('placeholder', 'Leave blank to keep the saved token');
    expect(latest).toEqual({ allowed_tools: [], send_user_id: true });
    fireEvent.change(screen.getByLabelText('MCP server URL'), {
      target: { value: 'https://tools.example/mcp' },
    });
    expect(
      screen.queryByText(
        'Enter the token again when you change the server URL.'
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'search' })
    ).not.toBeInTheDocument();
  });

  it('keeps selected tools for a URL whitespace change', () => {
    renderWithClient(
      <Harness
        initial={{
          allowed_tools: [{ name: 'search', fingerprint: 'a'.repeat(64) }],
          send_user_id: false,
        }}
      />
    );
    fireEvent.change(screen.getByLabelText('MCP server URL'), {
      target: { value: ' https://tools.example/mcp ' },
    });
    expect(screen.getByRole('checkbox', { name: 'search' })).toBeChecked();
    expect(latest).toBeUndefined();
  });

  it.each([
    ['not_object', 'Its input schema does not describe an object.'],
    ['too_deep', 'Its input schema is nested too deeply.'],
    ['malformed', 'Its input schema is malformed.'],
    ['unreadable', 'Its input schema cannot be read.'],
    ['too_large', 'Its input schema is too large.'],
    ['contains_token', 'Its input schema contains the token.'],
    ['name_too_long', 'Its name is longer than 128 characters.'],
    [
      'name_blank_or_padded',
      'Its name is empty or starts or ends with a space.',
    ],
  ])(
    'disables tools with problem code %s and translates its reason',
    async (problem, reason) => {
      jest.mocked(apiCall).mockResolvedValue({
        tools: [{ name: 'unusable', description: '', problem }],
      });
      renderWithClient(<Harness />);
      loadTools();
      expect(
        await screen.findByRole('checkbox', { name: 'unusable' })
      ).toBeDisabled();
      expect(screen.getByText(reason)).toBeInTheDocument();
    }
  );

  it('ignores a list that arrives after the server URL changed', async () => {
    let answer: (value: typeof listed) => void = () => {};
    jest.mocked(apiCall).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    renderWithClient(
      <Harness
        initial={{
          allowed_tools: [{ name: 'search', fingerprint: 'c'.repeat(64) }],
          send_user_id: false,
        }}
      />
    );

    loadTools();
    fireEvent.change(screen.getByLabelText('MCP server URL'), {
      target: { value: 'https://other.example/mcp' },
    });
    answer(listed);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Load tools' })).toBeEnabled()
    );
    expect(
      screen.queryByRole('checkbox', { name: 'search' })
    ).not.toBeInTheDocument();
    expect(latest).toEqual({ allowed_tools: [], send_user_id: false });
  });

  it('ignores a list that arrives after the form closed', async () => {
    let answer: (value: typeof listed) => void = () => {};
    jest.mocked(apiCall).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      })
    );
    const { unmount } = renderWithClient(
      <Harness
        initial={{
          allowed_tools: [{ name: 'search', fingerprint: 'c'.repeat(64) }],
          send_user_id: false,
        }}
      />
    );

    loadTools();
    unmount();
    answer(listed);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(latest).toBeUndefined();
  });

  it('will not allow a tool chat would leave out, and says why', async () => {
    jest.mocked(apiCall).mockResolvedValue(listed);
    renderWithClient(<Harness />);

    loadTools();

    expect(
      await screen.findByRole('checkbox', { name: 'broken' })
    ).toBeDisabled();
    expect(
      screen.getByText('Its input schema is malformed.')
    ).toBeInTheDocument();
  });

  it('sends a saved server’s ID and no token when none is typed', async () => {
    jest.mocked(apiCall).mockResolvedValue(listed);
    renderWithClient(<Harness providerId="server-1" />);

    loadTools();

    await waitFor(() =>
      expect(apiCall).toHaveBeenCalledWith(
        '/admin/external-data-providers/mcp-server/tools',
        expect.objectContaining({
          body: JSON.stringify({
            base_url: 'https://tools.example/mcp',
            provider_id: 'server-1',
          }),
        })
      )
    );
  });

  it('shows in the form why the tools could not be loaded', async () => {
    jest
      .mocked(apiCall)
      .mockRejectedValue(
        new HttpApiError('The server did not list its tools: HTTP 401', 502)
      );
    renderWithClient(<Harness />);

    loadTools();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server did not list its tools: HTTP 401'
    );
  });

  it('stops at twenty tools', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `tool_${i}`);
    jest.mocked(apiCall).mockResolvedValue({
      tools: [...twenty, 'one_more'].map((name) => ({
        name,
        fingerprint: 'a'.repeat(64),
        description: '',
        problem: null,
      })),
    });
    renderWithClient(
      <Harness
        initial={{
          allowed_tools: twenty.map((name) => ({
            name,
            fingerprint: 'a'.repeat(64),
          })),
          send_user_id: false,
        }}
      />
    );

    loadTools();

    expect(
      await screen.findByRole('checkbox', { name: 'one_more' })
    ).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'tool_0' })).toBeEnabled();
  });

  it('keeps a tool the server no longer lists, so the admin can remove it', async () => {
    jest.mocked(apiCall).mockResolvedValue(listed);
    renderWithClient(
      <Harness
        initial={{
          allowed_tools: [{ name: 'retired', fingerprint: 'a'.repeat(64) }],
          send_user_id: false,
        }}
      />
    );

    loadTools();
    expect(
      await screen.findByText('The server no longer lists this tool.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'retired' }));

    expect(latest).toEqual({ allowed_tools: [], send_user_id: false });
  });

  it('turns on telling the server who is chatting', () => {
    renderWithClient(<Harness />);

    fireEvent.click(
      screen.getByRole('switch', { name: 'Tell the server who is chatting' })
    );

    expect(latest).toEqual({ allowed_tools: [], send_user_id: true });
  });

  it('re-pins a selected tool after Load and explains the changed version', async () => {
    jest.mocked(apiCall).mockResolvedValue(listed);
    renderWithClient(
      <Harness
        initial={{
          allowed_tools: [
            { name: 'search', fingerprint: 'c'.repeat(64) },
            { name: 'retired', fingerprint: 'd'.repeat(64) },
          ],
          send_user_id: false,
        }}
      />
    );
    loadTools();
    expect(
      await screen.findByText(
        'Changed since it was saved. Saving allows this version.'
      )
    ).toBeInTheDocument();
    expect(latest?.allowed_tools).toEqual([
      { name: 'search', fingerprint: 'a'.repeat(64) },
      { name: 'retired', fingerprint: 'd'.repeat(64) },
    ]);
    expect(screen.getByRole('checkbox', { name: 'search' })).toBeChecked();
  });

  it('keeps saved fingerprints when editing without loading tools', () => {
    const saved = [{ name: 'search', fingerprint: 'c'.repeat(64) }];
    renderWithClient(
      <Harness initial={{ allowed_tools: saved, send_user_id: false }} />
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(latest).toEqual({ allowed_tools: saved, send_user_id: true });
    expect(apiCall).not.toHaveBeenCalled();
  });
});
