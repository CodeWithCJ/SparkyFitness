import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  useAui,
  useAuiState,
  type ToolCallMessagePart,
} from '@assistant-ui/react-native';
import { MIN_ASK_USER_OPTIONS, type AskUserInput } from '@workspace/shared';

export default function AskUserToolCard({
  part,
}: {
  part: ToolCallMessagePart;
}) {
  const aui = useAui();
  const isLast = useAuiState((state) => state.message.isLast);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const sentRef = useRef(false);
  const args = part.args as Partial<AskUserInput>;
  const options = Array.isArray(args.options)
    ? args.options.filter(
        (option): option is string => typeof option === 'string'
      )
    : [];
  const question =
    typeof args.question === 'string' ? args.question.trim() : '';

  if (!question || options.length < MIN_ASK_USER_OPTIONS) return null;

  const disabled = !isLast || isRunning;
  const send = (option: string) => {
    if (!isLast || isRunning || sentRef.current) return;
    sentRef.current = true;
    aui.thread().append({
      role: 'user',
      content: [{ type: 'text', text: option }],
    });
  };

  return (
    <View className="my-2 gap-2">
      <Text className="text-text-secondary text-sm">{question}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={option}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => send(option)}
            className={`rounded-full border border-border-subtle bg-background px-3 py-2 ${
              disabled ? 'opacity-50' : 'active:bg-surface'
            }`}
          >
            <Text className="text-text-primary text-sm font-medium">
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
