import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useAui, useAuiState } from '@assistant-ui/react';
import { readChatOutsideSource } from '@workspace/shared';
import { useDeleteChatMessage } from '@/hooks/AI/useSparkyChat';
import { Button } from '@/components/ui/button';

export function OutsideSourceLine({
  onClearChat,
}: {
  onClearChat?: () => void;
}) {
  const { t } = useTranslation();
  const aui = useAui();
  const deleteMessage = useDeleteChatMessage();
  const message = useAuiState((s) => s.message);
  const running = useAuiState((s) => s.thread.isRunning);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const sources = readChatOutsideSource(message.metadata);
  const outside = message.content.filter(
    (p) => p.type === 'tool-call' && p.toolName.startsWith('mcp_')
  );
  if (
    message.role !== 'assistant' ||
    (!sources.servers.length && !outside.length)
  )
    return null;
  const servers = sources.servers.length
    ? sources.servers
    : outside.map((p) =>
        p.type === 'tool-call'
          ? (sources.toolServers[p.toolName] ?? p.toolName)
          : ''
      );
  const saved = message.metadata.custom['savedMessageId'];
  const remove = async () => {
    if (deleting || running || typeof saved !== 'string') return;
    setDeleting(true);
    try {
      await deleteMessage(saved);
      await aui.message().delete();
    } catch {
      setFailed(true);
      setDeleting(false);
    }
  };
  return (
    <div className="mt-2 text-xs text-muted-foreground">
      <Trans
        i18nKey="chat.outsideSource.line"
        values={{ servers: [...new Set(servers)].join(', ') }}
        components={{ bold: <strong /> }}
      />{' '}
      {typeof saved === 'string' && (
        <>
          <Button
            variant="link"
            className="h-auto p-0 text-xs font-semibold"
            disabled={deleting || running}
            onClick={() => void remove()}
          >
            {t('chat.outsideSource.delete')}
          </Button>{' '}
          {t('chat.outsideSource.or')}{' '}
        </>
      )}
      <Button
        variant="link"
        className="h-auto p-0 text-xs font-semibold"
        disabled={running}
        onClick={onClearChat}
      >
        {t('chat.outsideSource.clear')}
      </Button>
      {failed && <p role="alert">{t('chat.outsideSource.failed')}</p>}
    </div>
  );
}
