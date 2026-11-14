import { useEffect, useId, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { CheckIcon, XIcon, LoaderIcon, AlertCircleIcon } from 'lucide-react';
import {
  useAui,
  useAuiState,
  type ToolCallMessagePartComponent,
} from '@assistant-ui/react';
import {
  readChatOutsideSource,
  chatToolLabel,
  chatOutsideToolTitle,
  chatArgsPreview,
  chatApprovalDescriptionKey,
  chatApprovalState,
  chatResultText,
  chatServerList,
} from '@workspace/shared';
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
  result,
  isError,
}) => {
  const { t, i18n } = useTranslation();
  const aui = useAui();
  const message = useAuiState((s) => s.message);
  const messages = useAuiState((s) => s.thread.messages);
  const running = useAuiState((s) => s.thread.isRunning);
  const [answer, setAnswer] = useState<boolean>();
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const sources = readChatOutsideSource(message.metadata);
  const laterMessage =
    messages
      ?.slice(messages.findIndex((m) => m.id === message.id) + 1)
      .some((m) => m.role === 'user') ?? false;
  const state = chatApprovalState(
    approval,
    answer,
    result,
    !!isError,
    laterMessage
  );
  const wasPending = useRef(state.pending);
  useEffect(() => {
    if (wasPending.current && !state.pending) statusRef.current?.focus();
    wasPending.current = state.pending;
  }, [state.pending]);
  if (!approval) return null;
  const disabled = !state.pending || running;
  const summary = sources.approvalSummaries[toolCallId];
  const servers = sources.approvalSources[toolCallId] ?? sources.servers;
  const otherPending =
    message.content.some(
      (p) =>
        p.type === 'tool-call' &&
        p.toolCallId !== toolCallId &&
        p.approval &&
        p.approval.approved === undefined &&
        !p.approval.resolution
    ) && !laterMessage;
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
  const Icon = state.working
    ? LoaderIcon
    : state.failed
      ? AlertCircleIcon
      : state.title === 'allowed'
        ? CheckIcon
        : XIcon;
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      data-testid="approval-card"
      className="my-2 rounded-lg border p-4 space-y-3"
    >
      <div
        ref={statusRef}
        role={state.pending ? undefined : 'status'}
        tabIndex={state.pending ? undefined : -1}
        aria-live="polite"
      >
        <h3 id={titleId} className="font-semibold flex items-center gap-2">
          {!state.pending && (
            <Icon
              aria-hidden
              className={`size-4 ${state.working ? 'animate-spin' : ''} ${state.failed ? 'text-destructive' : ''}`}
            />
          )}
          {t(`chat.approval.${state.title}`)}
        </h3>
        {state.status && (
          <p className="text-sm">{t(`chat.approval.${state.status}`)}</p>
        )}
      </div>
      {state.pending && (
        <span className="sr-only" role="status">
          {t('chat.approval.announce')}
        </span>
      )}
      <p>
        <Trans
          i18nKey={chatApprovalDescriptionKey(
            summary
              ? summary.kind === 'delete'
                ? servers.length
                  ? 'deleteAfter'
                  : 'delete'
                : servers.length
                  ? 'changeAfter'
                  : 'change'
              : !servers.length
                ? 'runPlain'
                : toolName.startsWith('mcp_')
                  ? 'send'
                  : 'run',
            state
          )}
          values={{
            summary: summary?.text,
            server: chatServerList(servers, i18n.language),
            tool:
              toolName.startsWith('mcp_') && servers.length
                ? chatOutsideToolTitle(t, toolName, sources)
                : chatToolLabel(t, toolName, sources, args.action),
            otherServer:
              sources.toolServers[toolName] ?? t('chat.tools.outside'),
          }}
          components={{ bold: <strong /> }}
        />
      </p>
      {!summary && (
        <p
          aria-hidden="true"
          className="truncate text-xs text-muted-foreground"
        >
          {chatArgsPreview(args, i18n.language)}
        </p>
      )}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost">{t('chat.approval.details')}</Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {state.failed && (
            <p role="alert" className="text-sm text-destructive">
              {chatResultText(
                t,
                result,
                sources.toolServers[toolName] ?? t('chat.tools.outside')
              )}
            </p>
          )}
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
            {JSON.stringify(args, null, 2)}
          </pre>
        </CollapsibleContent>
      </Collapsible>
      {state.pending && (
        <div className="flex gap-3">
          <Button
            data-testid="approval-allow"
            disabled={disabled}
            onClick={() => void respond(true)}
          >
            {t('chat.approval.allow')}
          </Button>
          <Button
            data-testid="approval-deny"
            variant="outline"
            disabled={disabled}
            onClick={() => void respond(false)}
          >
            {t('chat.approval.deny')}
          </Button>
        </div>
      )}
      {!state.pending && otherPending && (
        <p className="text-sm">{t('chat.approval.otherPending')}</p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t('chat.approval.failed')}
        </p>
      )}
    </div>
  );
};
