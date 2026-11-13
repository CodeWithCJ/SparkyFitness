import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useAui, useAuiState } from '@assistant-ui/react';
import { chatServerList, readChatOutsideSource } from '@workspace/shared';
import { useDeleteChatMessage } from '@/hooks/AI/useSparkyChat';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function OutsideSourceLine({
  onClearChat,
}: {
  onClearChat?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const aui = useAui();
  const deleteMessage = useDeleteChatMessage();
  const message = useAuiState((s) => s.message);
  const running = useAuiState((s) => s.thread.isRunning);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sources = readChatOutsideSource(message.metadata);
  const outside = message.content.filter(
    (p) => p.type === 'tool-call' && p.toolName.startsWith('mcp_')
  );
  if (
    message.status?.type === 'running' ||
    message.role !== 'assistant' ||
    (!sources.servers.length && !outside.length)
  )
    return null;
  const servers = sources.servers.length
    ? sources.servers
    : outside.map((p) =>
        p.type === 'tool-call'
          ? (sources.toolServers[p.toolName] ?? t('chat.tools.outside'))
          : ''
      );
  const saved = message.metadata.custom['savedMessageId'];
  const remove = async () => {
    if (deleting || running || typeof saved !== 'string') return;
    setDeleting(true);
    setFailed(false);
    try {
      await deleteMessage(saved);
      await aui.message().delete();
    } catch {
      setFailed(true);
      setDeleting(false);
    }
  };
  return (
    <div
      data-testid="outside-source-line"
      className="mt-2 text-sm text-muted-foreground"
      aria-busy={deleting}
    >
      <p>
        <Trans
          i18nKey="chat.outsideSource.line"
          values={{ servers: chatServerList(servers, i18n.language) }}
          components={{ bold: <strong /> }}
        />
      </p>
      <div className="mt-2 flex gap-4">
        {typeof saved === 'string' && (
          <Button
            variant="link"
            className="h-auto p-0 text-sm font-semibold"
            disabled={deleting || running}
            onClick={() => setConfirmDelete(true)}
          >
            {t('chat.outsideSource.delete')}
          </Button>
        )}
        <Button
          variant="link"
          className="h-auto p-0 text-sm font-semibold"
          disabled={deleting || running}
          onClick={onClearChat}
        >
          {t('chat.outsideSource.clear')}
        </Button>
      </div>
      {deleting && <p role="status">{t('chat.outsideSource.deleting')}</p>}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t('chat.outsideSource.failed')}
        </p>
      )}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('chat.outsideSource.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('chat.outsideSource.deleteBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('chat.outsideSource.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => void remove()}
            >
              {t('chat.outsideSource.confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
