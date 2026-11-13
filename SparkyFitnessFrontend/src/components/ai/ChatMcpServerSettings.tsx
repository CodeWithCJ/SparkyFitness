import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useChatMcpServers } from '@/hooks/AI/useChatMcpServers';

export function ChatMcpServerSettings() {
  const { t } = useTranslation();
  const { servers, isSaving, save } = useChatMcpServers();
  if (servers.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('settings.chatMcp.title', 'Tools from outside servers')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.chatMcp.description',
            'What chat sends to these tools goes to that server.'
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {servers.map((server) => (
          <div
            key={server.id}
            className="flex items-center justify-between gap-4"
          >
            <Label htmlFor={`chat-mcp-server-${server.id}`}>
              {t('settings.chatMcp.allow', {
                defaultValue: 'Let chat use tools from {{name}}',
                name: server.name,
              })}
            </Label>
            <Switch
              id={`chat-mcp-server-${server.id}`}
              checked={server.enabled}
              disabled={isSaving}
              onCheckedChange={(enabled) => {
                save(
                  servers
                    .filter((item) =>
                      item.id === server.id ? enabled : item.enabled
                    )
                    .map(({ id }) => id)
                );
              }}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
