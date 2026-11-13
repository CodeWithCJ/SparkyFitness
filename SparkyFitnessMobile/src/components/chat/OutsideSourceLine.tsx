import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pressable, Text, View } from 'react-native';
import { Trans, useTranslation } from 'react-i18next';
import { useAui, useAuiState } from '@assistant-ui/react-native';
import { readChatOutsideSource } from '@workspace/shared';
import { chatHistoryQueryKey } from '../../hooks/queryKeys';
import { deleteChatMessage } from '../../services/api/chatApi';

export default function OutsideSourceLine({
  onClearChat,
}: {
  onClearChat: () => void;
}) {
  const { t } = useTranslation();
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
  return (
    <View testID="outside-source-line" className="mt-2 gap-1">
      <Text className="text-text-muted text-xs">
        <Trans
          i18nKey="chat.outsideSource.line"
          values={{ servers: [...new Set(servers)].join(', ') }}
          components={{ bold: <Text style={{ fontWeight: 'bold' }} /> }}
        />
      </Text>
      <View className="flex-row flex-wrap gap-1">
        {typeof saved === 'string' && (
          <>
            <Pressable
              testID="outside-delete-message"
              accessibilityRole="button"
              disabled={deleting || running}
              onPress={() => void remove()}
            >
              <Text className="text-accent-primary text-xs font-semibold">
                {t('chat.outsideSource.delete', {
                  defaultValue: 'Delete this message',
                })}
              </Text>
            </Pressable>
            <Text className="text-text-muted text-xs">
              {t('chat.outsideSource.or', { defaultValue: 'or' })}
            </Text>
          </>
        )}
        <Pressable
          testID="outside-clear-chat"
          accessibilityRole="button"
          disabled={running}
          onPress={onClearChat}
        >
          <Text className="text-accent-primary text-xs font-semibold">
            {t('chat.outsideSource.clear', { defaultValue: 'clear the chat' })}
          </Text>
        </Pressable>
      </View>
      {failed && (
        <Text accessibilityRole="alert" className="text-text-primary">
          {t('chat.outsideSource.failed', {
            defaultValue: 'Could not delete this message. Please try again.',
          })}
        </Text>
      )}
    </View>
  );
}
