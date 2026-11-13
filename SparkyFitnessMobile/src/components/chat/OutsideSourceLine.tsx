import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { Trans, useTranslation } from 'react-i18next';
import { useAui, useAuiState } from '@assistant-ui/react-native';
import { chatServerList, readChatOutsideSource } from '@workspace/shared';
import { chatHistoryQueryKey } from '../../hooks/queryKeys';
import { deleteChatMessage } from '../../services/api/chatApi';

function SourceLink({
  children,
  ...props
}: PressableProps & { children?: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      {...props}
    >
      <Text className="text-accent-primary text-sm font-semibold">
        {children}
      </Text>
    </Pressable>
  );
}

export default function OutsideSourceLine({
  onClearChat,
}: {
  onClearChat: () => void;
}) {
  const { t, i18n } = useTranslation();
  const aui = useAui();
  const queryClient = useQueryClient();
  const message = useAuiState((s) => s.message);
  const running = useAuiState((s) => s.thread.isRunning);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
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
          ? (sources.toolServers[p.toolName] ??
            t('chat.tools.outside', {
              defaultValue: 'an outside tool',
            }))
          : ''
      );
  const saved = message.metadata.custom['savedMessageId'];
  const remove = async () => {
    if (deleting || running || typeof saved !== 'string') return;
    setDeleting(true);
    setFailed(false);
    try {
      await deleteChatMessage(saved);
      await queryClient.cancelQueries({ queryKey: chatHistoryQueryKey });
      queryClient.setQueriesData<{ id: string }[]>(
        { queryKey: chatHistoryQueryKey },
        (entries) => entries?.filter((entry) => entry.id !== saved)
      );
      await aui.message().delete();
    } catch {
      setFailed(true);
      setDeleting(false);
    }
  };
  const confirmDelete = () =>
    Alert.alert(
      t('chat.outsideSource.deleteTitle', {
        defaultValue: 'Delete this reply?',
      }),
      t('chat.outsideSource.deleteBody', {
        defaultValue:
          'This removes the reply from your chat. It does not undo anything Sparky already changed.',
      }),
      [
        {
          text: t('chat.outsideSource.cancel', {
            defaultValue: 'Cancel',
          }),
          style: 'cancel',
        },
        {
          text: t('chat.outsideSource.confirmDelete', {
            defaultValue: 'Delete',
          }),
          style: 'destructive',
          onPress: () => void remove(),
        },
      ]
    );
  return (
    <View
      testID="outside-source-line"
      className="mt-2 gap-3"
      style={{ opacity: deleting || running ? 0.5 : 1 }}
    >
      <Text className="text-text-muted text-sm">
        <Trans
          i18nKey="chat.outsideSource.line"
          values={{ servers: chatServerList(servers, i18n.language) }}
          components={{ bold: <Text style={{ fontWeight: 'bold' }} /> }}
        />
      </Text>
      <View className="flex-row gap-4">
        {typeof saved === 'string' && (
          <SourceLink
            testID="outside-delete-message"
            accessibilityState={{ disabled: deleting || running }}
            disabled={deleting || running}
            onPress={confirmDelete}
          >
            {t('chat.outsideSource.delete', {
              defaultValue: 'Delete this message',
            })}
          </SourceLink>
        )}
        <SourceLink
          testID="outside-clear-chat"
          accessibilityState={{ disabled: deleting || running }}
          disabled={deleting || running}
          onPress={onClearChat}
        >
          {t('chat.outsideSource.clear', { defaultValue: 'Clear chat' })}
        </SourceLink>
      </View>
      {deleting && (
        <ActivityIndicator
          size="small"
          accessibilityLabel={t('chat.outsideSource.deleting', {
            defaultValue: 'Deleting…',
          })}
        />
      )}
      {failed && (
        <Text accessibilityRole="alert" className="text-icon-danger text-sm">
          {t('chat.outsideSource.failed', {
            defaultValue: 'Could not delete this message. Please try again.',
          })}
        </Text>
      )}
    </View>
  );
}
