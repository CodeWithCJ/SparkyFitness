import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Trans, useTranslation } from 'react-i18next';
import {
  useAui,
  useAuiState,
  type ToolCallMessagePart,
} from '@assistant-ui/react-native';
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
import Button from '../ui/Button';
import Icon from '../Icon';

export default function ApprovalCard({ part }: { part: ToolCallMessagePart }) {
  const { t, i18n } = useTranslation();
  const aui = useAui();
  const message = useAuiState((s) => s.message);
  const messages = useAuiState((s) => s.thread.messages);
  const running = useAuiState((s) => s.thread.isRunning);
  const [expanded, setExpanded] = useState(false);
  const [answer, setAnswer] = useState<boolean>();
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const sources = readChatOutsideSource(message.metadata);
  const laterMessage =
    messages
      ?.slice(messages.findIndex((m) => m.id === message.id) + 1)
      .some((m) => m.role === 'user') ?? false;
  const state = chatApprovalState(
    part.approval,
    answer,
    part.result,
    !!part.isError,
    laterMessage
  );
  const titles = {
    title: t('chat.approval.title', {
      defaultValue: 'Allow this step?',
    }),
    allowed: t('chat.approval.allowed', {
      defaultValue: 'Allowed',
    }),
    denied: t('chat.approval.denied', {
      defaultValue: 'Denied',
    }),
    notRun: t('chat.approval.notRun', {
      defaultValue: 'Not run',
    }),
    toolFailed: t('chat.approval.toolFailed', {
      defaultValue: "Allowed, but it didn't work",
    }),
  };
  const statuses = {
    working: t('chat.approval.working', {
      defaultValue: 'Working on it…',
    }),
    done: t('chat.approval.done', { defaultValue: 'Done' }),
    cancelled: t('chat.approval.cancelled', {
      defaultValue: 'You sent a new message first.',
    }),
    nothingChanged: t('chat.approval.nothingChanged', {
      defaultValue: 'Nothing was changed.',
    }),
  };
  useEffect(() => {
    if (state.pending)
      AccessibilityInfo.announceForAccessibility(
        t('chat.approval.announce', {
          defaultValue: 'Sparky needs your answer: Allow this step?',
        })
      );
  }, [state.pending, t]);
  if (!part.approval) return null;
  const disabled = !state.pending || running;
  const summary = sources.approvalSummaries[part.toolCallId];
  const servers = sources.approvalSources[part.toolCallId] ?? sources.servers;
  const otherPending =
    message.content.some(
      (p) =>
        p.type === 'tool-call' &&
        p.toolCallId !== part.toolCallId &&
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
        .part({ toolCallId: part.toolCallId })
        .respondToToolApproval({ approved: value });
    } catch {
      setAnswer(undefined);
      setFailed(true);
    } finally {
      submitting.current = false;
    }
  };
  return (
    <View
      testID="approval-card"
      className="my-2 rounded-xl bg-raised p-3 gap-3"
    >
      <View className="flex-row items-center gap-2">
        {state.working ? (
          <ActivityIndicator size="small" />
        ) : (
          !state.pending && (
            <Icon
              name={
                state.failed
                  ? 'alert-circle'
                  : state.title === 'allowed'
                    ? 'checkmark-circle'
                    : 'close'
              }
              size={18}
            />
          )
        )}
        <Text
          accessibilityRole="header"
          className="text-text-primary font-semibold"
        >
          {titles[state.title]}
        </Text>
      </View>
      {state.status && (
        <Text
          accessibilityLiveRegion="polite"
          className="text-text-secondary text-sm"
        >
          {statuses[state.status]}
        </Text>
      )}
      <Text className="text-text-primary">
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
                : part.toolName.startsWith('mcp_')
                  ? 'send'
                  : 'run',
            state
          )}
          values={{
            summary: summary?.text,
            server: chatServerList(servers, i18n.language),
            tool:
              part.toolName.startsWith('mcp_') && servers.length
                ? chatOutsideToolTitle(t, part.toolName, sources)
                : chatToolLabel(t, part.toolName, sources, part.args.action),
            otherServer:
              sources.toolServers[part.toolName] ??
              t('chat.tools.outside', {
                defaultValue: 'an outside tool',
              }),
          }}
          components={{ bold: <Text style={{ fontWeight: 'bold' }} /> }}
        />
      </Text>
      {!summary && (
        <Text
          testID="approval-arguments"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          numberOfLines={1}
          className="text-text-secondary text-xs"
        >
          {chatArgsPreview(part.args, i18n.language)}
        </Text>
      )}
      <Pressable
        testID="approval-details"
        hitSlop={12}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
      >
        <Text className="text-accent-primary">
          {t('chat.approval.details', {
            defaultValue: 'Details',
          })}
        </Text>
      </Pressable>
      {expanded && (
        // A plain view: a scroll view nested in the chat list left blank space
        // under the reply on iOS and pushed its links off the screen.
        <View className="gap-1">
          {state.failed && (
            <Text
              accessibilityRole="alert"
              className="text-icon-danger text-sm"
            >
              {chatResultText(
                t,
                part.result,
                sources.toolServers[part.toolName] ??
                  t('chat.tools.outside', {
                    defaultValue: 'an outside tool',
                  })
              )}
            </Text>
          )}
          <Text
            selectable
            className="text-text-secondary text-xs"
            style={{
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            }}
          >
            {JSON.stringify(part.args, null, 2)}
          </Text>
        </View>
      )}
      {state.pending && (
        <View className="flex-row gap-3">
          <Button
            testID="approval-allow"
            accessibilityRole="button"
            className="flex-1 min-h-11"
            disabled={disabled}
            onPress={() => void respond(true)}
          >
            {t('chat.approval.allow', {
              defaultValue: 'Allow',
            })}
          </Button>
          <Button
            testID="approval-deny"
            accessibilityRole="button"
            variant="outline"
            className="flex-1 min-h-11"
            disabled={disabled}
            onPress={() => void respond(false)}
          >
            {t('chat.approval.deny', {
              defaultValue: 'Deny',
            })}
          </Button>
        </View>
      )}
      {!state.pending && otherPending && (
        <Text className="text-text-secondary text-sm">
          {t('chat.approval.otherPending', {
            defaultValue: 'Answer the other step to continue.',
          })}
        </Text>
      )}
      {failed && (
        <Text accessibilityRole="alert" className="text-icon-danger text-sm">
          {t('chat.approval.failed', {
            defaultValue: 'Could not save your answer. Please try again.',
          })}
        </Text>
      )}
    </View>
  );
}
