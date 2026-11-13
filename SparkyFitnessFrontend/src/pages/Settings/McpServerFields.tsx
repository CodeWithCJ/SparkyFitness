import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useListMcpServerToolsMutation } from '@/hooks/Settings/useExternalProviderSettings';
import {
  MCP_SERVER_MAX_TOOLS,
  MCP_SERVER_USER_ID_HEADER,
  type McpServerOptions,
  type McpServerToolChoice,
} from '@workspace/shared';
import { useTranslation } from 'react-i18next';

interface McpServerFieldsProps {
  idPrefix: string;
  baseUrl: string | null | undefined;
  appKey: string | null | undefined;
  options: McpServerOptions | null | undefined;
  /** The ID of a saved server, whose stored token is used when none is typed. */
  providerId?: string;
  savedBaseUrl?: string | null;
  onBaseUrlChange: (value: string) => void;
  onAppKeyChange: (value: string) => void;
  onOptionsChange: (options: McpServerOptions) => void;
}

interface ToolRow {
  name: string;
  description: string;
  problem: McpServerToolChoice['problem'];
  // Allowed before, but not in the list the server just gave.
  gone: boolean;
}

const EMPTY_OPTIONS: McpServerOptions = {
  allowed_tools: [],
  send_user_id: false,
};

/**
 * The fields of an MCP tool server, which only an admin adds: the server URL,
 * an optional bearer token, the tools chat may use (picked from the list the
 * server gives), and whether the server is told who is chatting.
 */
export const McpServerFields = ({
  idPrefix,
  baseUrl,
  appKey,
  options,
  providerId,
  savedBaseUrl,
  onBaseUrlChange,
  onAppKeyChange,
  onOptionsChange,
}: McpServerFieldsProps) => {
  const { t } = useTranslation();
  const current = options ?? EMPTY_OPTIONS;
  const urlChanged =
    !!providerId && (baseUrl ?? '').trim() !== (savedBaseUrl ?? '').trim();
  const problemText: Record<
    NonNullable<McpServerToolChoice['problem']>,
    string
  > = {
    not_object: t(
      'settings.mcpServer.toolProblem.not_object',
      'Its input schema does not describe an object.'
    ),
    too_deep: t(
      'settings.mcpServer.toolProblem.too_deep',
      'Its input schema is nested too deeply.'
    ),
    malformed: t(
      'settings.mcpServer.toolProblem.malformed',
      'Its input schema is malformed.'
    ),
    unreadable: t(
      'settings.mcpServer.toolProblem.unreadable',
      'Its input schema cannot be read.'
    ),
    too_large: t(
      'settings.mcpServer.toolProblem.too_large',
      'Its input schema is too large.'
    ),
    contains_token: t(
      'settings.mcpServer.toolProblem.contains_token',
      'Its input schema contains the token.'
    ),
    name_too_long: t(
      'settings.mcpServer.toolProblem.name_too_long',
      'Its name is longer than 128 characters.'
    ),
    name_blank_or_padded: t(
      'settings.mcpServer.toolProblem.name_blank_or_padded',
      'Its name is empty or starts or ends with a space.'
    ),
  };
  const allowed = new Set(current.allowed_tools);
  // A list, or why it failed, is kept with the URL and token it was asked
  // with and shown only while the fields still hold them, so tools from one
  // server are never offered for another, even when an answer arrives late.
  const [result, setResult] = useState<{
    inputs: string;
    tools: McpServerToolChoice[] | null;
    error: string | null;
  } | null>(null);
  const { mutateAsync: listTools, isPending } = useListMcpServerToolsMutation();
  const inputs = JSON.stringify([(baseUrl ?? '').trim(), appKey?.trim() ?? '']);
  const shown = result?.inputs === inputs ? result : null;
  const loaded = shown?.tools ?? null;
  const loadError = shown?.error ?? null;

  const loadTools = async () => {
    const asked = inputs;
    setResult(null);
    try {
      const { tools } = await listTools({
        base_url: (baseUrl ?? '').trim(),
        app_key: appKey?.trim() || undefined,
        provider_id: providerId,
      });
      setResult({ inputs: asked, tools, error: null });
    } catch (error) {
      setResult({
        inputs: asked,
        tools: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const loadedNames = new Set((loaded ?? []).map((tool) => tool.name));
  const rows: ToolRow[] = [
    ...(loaded ?? []).map((tool) => ({ ...tool, gone: false })),
    ...current.allowed_tools
      .filter((name) => !loadedNames.has(name))
      .map((name) => ({
        name,
        description: '',
        problem: null,
        gone: loaded !== null,
      })),
  ];
  const full = allowed.size >= MCP_SERVER_MAX_TOOLS;

  const setAllowed = (name: string, on: boolean) => {
    const next = on
      ? [...current.allowed_tools, name]
      : current.allowed_tools.filter((allowedName) => allowedName !== name);
    onOptionsChange({ ...current, allowed_tools: next });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          'settings.mcpServer.trustNote',
          'Whatever the assistant passes to these tools is sent to this server, and what comes back enters the chat. Add only servers you trust.'
        )}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor={`${idPrefix}_mcp_base_url`}>
            {t('settings.mcpServer.baseUrlLabel', 'MCP server URL')}
          </Label>
          <Input
            id={`${idPrefix}_mcp_base_url`}
            type="text"
            value={baseUrl || ''}
            onChange={(e) => {
              const value = e.target.value;
              if (value.trim() !== (baseUrl ?? '').trim()) {
                onOptionsChange({ ...current, allowed_tools: [] });
              }
              onBaseUrlChange(value);
            }}
            placeholder="https://tools.example.com/mcp"
            autoComplete="off"
          />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}_mcp_app_key`}>
            {t('settings.mcpServer.tokenLabel', 'Bearer token (optional)')}
          </Label>
          <Input
            id={`${idPrefix}_mcp_app_key`}
            type="password"
            value={appKey || ''}
            onChange={(e) => onAppKeyChange(e.target.value)}
            placeholder={
              providerId && !urlChanged
                ? t(
                    'settings.mcpServer.tokenKeepPlaceholder',
                    'Leave blank to keep the saved token'
                  )
                : ''
            }
            autoComplete="off"
          />
          {urlChanged && (
            <p className="text-sm text-muted-foreground">
              {t(
                'settings.mcpServer.tokenUrlChanged',
                'Enter the token again when you change the server URL.'
              )}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={loadTools}
            disabled={isPending || !baseUrl?.trim()}
          >
            {isPending
              ? t('settings.mcpServer.loadingTools', 'Loading tools...')
              : t('settings.mcpServer.loadTools', 'Load tools')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t(
              'settings.mcpServer.allowedCount',
              'Chat may use {{count}} of at most {{max}} tools.',
              { count: allowed.size, max: MCP_SERVER_MAX_TOOLS }
            )}
          </span>
        </div>
        {loadError && (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        )}
        {loaded !== null && loaded.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('settings.mcpServer.noTools', 'The server lists no tools.')}
          </p>
        )}
        {rows.length > 0 && (
          <ul className="space-y-2 rounded-md border p-3">
            {rows.map((row) => {
              const checked = allowed.has(row.name);
              const id = `${idPrefix}_mcp_tool_${row.name}`;
              return (
                <li key={row.name} className="flex items-start gap-3">
                  <Checkbox
                    id={id}
                    checked={checked}
                    disabled={!checked && (row.problem !== null || full)}
                    onCheckedChange={(on) => setAllowed(row.name, on === true)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor={id} className="font-mono break-all">
                      {row.name}
                    </Label>
                    {row.description && (
                      <p className="text-sm text-muted-foreground break-words">
                        {row.description}
                      </p>
                    )}
                    {row.problem && (
                      <p className="text-sm text-destructive">
                        {problemText[row.problem]}
                      </p>
                    )}
                    {row.gone && (
                      <p className="text-sm text-destructive">
                        {t(
                          'settings.mcpServer.toolGone',
                          'The server no longer lists this tool.'
                        )}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <Switch
            id={`${idPrefix}_mcp_send_user_id`}
            checked={current.send_user_id}
            onCheckedChange={(on) =>
              onOptionsChange({ ...current, send_user_id: on })
            }
          />
          <Label htmlFor={`${idPrefix}_mcp_send_user_id`}>
            {t(
              'settings.mcpServer.sendUserIdLabel',
              'Tell the server who is chatting'
            )}
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.mcpServer.sendUserIdHelp',
            "Sends the signed-in person's user ID in the {{header}} header, for a server that keeps data per person.",
            { header: MCP_SERVER_USER_ID_HEADER }
          )}
        </p>
      </div>
    </div>
  );
};
