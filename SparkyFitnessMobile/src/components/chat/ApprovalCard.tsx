import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Trans, useTranslation } from 'react-i18next';
import {
  useAui,
  useAuiState,
  type ToolCallMessagePart,
} from '@assistant-ui/react-native';
import { readChatOutsideSource } from '@workspace/shared';
import { getLocalizedToolLabel, getToolDisplay } from '../../constants/chat';

export default function ApprovalCard({ part }: { part: ToolCallMessagePart }) {
  const { t } = useTranslation();
  const aui = useAui();
  const metadata = useAuiState((s) => s.message.metadata);
  const running = useAuiState((s) => s.thread.isRunning);
  const [expanded, setExpanded] = useState(false);
  const [answer, setAnswer] = useState<boolean>();
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const sources = readChatOutsideSource(metadata);
  if (!part.approval) return null;
  const approved = part.approval.approved ?? answer;
  const disabled =
    approved !== undefined || !!part.approval.resolution || running;
  const action =
    typeof part.args.action === 'string' ? ` (${part.args.action})` : '';
  const display = getToolDisplay(part.toolName);
  const label = getLocalizedToolLabel(
    t,
    display.labelKey,
    display.defaultLabel
  );
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
      className="my-2 rounded-xl border border-border-subtle p-3 gap-3"
    >
      <Text className="text-text-primary font-semibold">
        {t('chat.approval.title', { defaultValue: 'Allow this step?' })}
      </Text>
      <Text className="text-text-primary">
        <Trans
          i18nKey={
            part.toolName.startsWith('mcp_')
              ? 'chat.approval.send'
              : 'chat.approval.run'
          }
          values={{
            server: (
              sources.approvalSources[part.toolCallId] ?? sources.servers
            ).join(', '),
            tool: label,
            action,
            otherServer: sources.toolServers[part.toolName] ?? part.toolName,
          }}
          components={{ bold: <Text style={{ fontWeight: 'bold' }} /> }}
        />
      </Text>
      <Pressable
        testID="approval-details"
        accessibilityRole="button"
        onPress={() => setExpanded((v) => !v)}
      >
        <Text className="text-accent-primary">
          {t('chat.approval.details', { defaultValue: 'Details' })}
        </Text>
      </Pressable>
      {expanded && (
        <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
          <ScrollView horizontal>
            <Text
              selectable
              className="text-text-secondary text-xs"
              style={{
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              }}
            >
              {JSON.stringify(part.args, null, 2)}
            </Text>
          </ScrollView>
        </ScrollView>
      )}
      {approved === undefined ? (
        <View className="flex-row gap-4">
          <Pressable
            testID="approval-allow"
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => void respond(true)}
          >
            <Text className="text-accent-primary">
              {t('chat.approval.allow', { defaultValue: 'Allow' })}
            </Text>
          </Pressable>
          <Pressable
            testID="approval-deny"
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => void respond(false)}
          >
            <Text className="text-accent-primary">
              {t('chat.approval.deny', { defaultValue: 'Deny' })}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text className="text-text-primary">
          {approved
            ? t('chat.approval.allowed', { defaultValue: 'Allowed' })
            : t('chat.approval.denied', { defaultValue: 'Denied' })}
        </Text>
      )}
      {failed && (
        <Text accessibilityRole="alert" className="text-text-primary">
          {t('chat.approval.failed', {
            defaultValue: 'Could not save your answer. Please try again.',
          })}
        </Text>
      )}
    </View>
  );
}
