import { useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  useAui,
  useAuiState,
  type ToolCallMessagePartComponent,
} from '@assistant-ui/react';
import { readChatOutsideSource } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export const ApprovalCard: ToolCallMessagePartComponent = ({
  toolName,
  toolCallId,
  args,
  approval,
}) => {
  const { t } = useTranslation();
  const aui = useAui();
  const metadata = useAuiState((s) => s.message.metadata);
  const running = useAuiState((s) => s.thread.isRunning);
  const [answer, setAnswer] = useState<boolean>();
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const sources = readChatOutsideSource(metadata);
  if (!approval) return null;
  const approved = approval.approved ?? answer;
  const disabled = approved !== undefined || !!approval.resolution || running;
  const action = typeof args.action === 'string' ? ` (${args.action})` : '';
  const respond = async (value: boolean) => {
    if (disabled || submitting.current) return;
    submitting.current = true;
    setAnswer(value);
    setFailed(false);
    try {
      await aui
        .message()
        .part({ toolCallId })
        .respondToToolApproval({ approved: value });
    } catch {
      setAnswer(undefined);
      setFailed(true);
    } finally {
      submitting.current = false;
    }
  };
  return (
    <div className="my-2 rounded-lg border p-4 space-y-3">
      <p className="font-semibold">{t('chat.approval.title')}</p>
      <p>
        <Trans
          i18nKey={
            toolName.startsWith('mcp_')
              ? 'chat.approval.send'
              : 'chat.approval.run'
          }
          values={{
            server: (
              sources.approvalSources[toolCallId] ?? sources.servers
            ).join(', '),
            tool: toolName,
            action,
            otherServer: sources.toolServers[toolName] ?? toolName,
          }}
          components={{ bold: <strong /> }}
        />
      </p>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost">{t('chat.approval.details')}</Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="max-h-64 overflow-auto whitespace-pre font-mono text-xs">
            {JSON.stringify(args, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
      {approved === undefined ? (
        <div className="flex gap-2">
          <Button disabled={disabled} onClick={() => void respond(true)}>
            {t('chat.approval.allow')}
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => void respond(false)}
          >
            {t('chat.approval.deny')}
          </Button>
        </div>
      ) : (
        <p>
          {approved ? t('chat.approval.allowed') : t('chat.approval.denied')}
        </p>
      )}
      {failed && <p role="alert">{t('chat.approval.failed')}</p>}
    </div>
  );
};
