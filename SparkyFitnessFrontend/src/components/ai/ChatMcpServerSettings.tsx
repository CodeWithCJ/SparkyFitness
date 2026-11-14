import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useChatMcpServers } from '@/hooks/AI/useChatMcpServers';

export function ChatMcpServerSettings() {
  const { t } = useTranslation();
  const { servers, savingServerIds, save } = useChatMcpServers();
  const { isActingOnBehalf } = useActiveUser();
  if (isActingOnBehalf)
    return (
      <p className="text-sm text-muted-foreground">
        {t('settings.chatMcp.familyOff')}
      </p>
    );
  if (servers.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.chatMcp.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('settings.chatMcp.description')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {servers.map((server) => (
          <div
            key={server.id}
            className="flex items-center justify-between gap-4"
          >
            <div>
              <Label htmlFor={`chat-mcp-server-${server.id}`}>
                {t('settings.chatMcp.allow', {
                  name: server.name,
                })}
              </Label>
              {server.send_user_id && (
                <p className="text-sm text-muted-foreground">
                  {t('settings.chatMcp.accountId')}
                </p>
              )}
            </div>
            <Switch
              id={`chat-mcp-server-${server.id}`}
              checked={server.enabled}
              disabled={savingServerIds.includes(server.id)}
              onCheckedChange={(enabled) => {
                save({
                  server_id: server.id,
                  enabled,
                  send_user_id: server.send_user_id,
                });
              }}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
