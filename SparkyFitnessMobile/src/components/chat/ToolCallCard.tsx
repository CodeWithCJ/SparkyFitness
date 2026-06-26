import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import type { ToolCallMessagePart } from '@assistant-ui/react-native';
import Icon from '../Icon';
import MarkdownMessage from './MarkdownMessage';
import { getToolDisplay, isLookupTool } from '../../constants/chat';

/**
 * Generic collapsible card for a single tool call. The server's logging tools
 * return human-readable confirmation strings (e.g. `✅ Logged "2 eggs" …`), so a
 * single reusable card covers every tool rather than bespoke per-tool UI.
 *
 * `ToolCallMessagePart` carries no `status` field — state is derived from
 * `result`/`isError`: no result and no error → running; `isError` → error;
 * otherwise → complete.
 */

type ToolStatus = 'running' | 'complete' | 'error';

function deriveStatus(part: ToolCallMessagePart): ToolStatus {
  if (part.isError) return 'error';
  if (part.result === undefined) return 'running';
  return 'complete';
}

const MONO_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' });

export default function ToolCallCard({ part }: { part: ToolCallMessagePart }) {
  const [expanded, setExpanded] = useState(false);
  const [muted, iconSuccess, iconDanger, secondary] = useCSSVariable([
    '--color-text-muted',
    '--color-icon-success',
    '--color-icon-danger',
    '--color-text-secondary',
  ]) as [string, string, string, string];

  const status = deriveStatus(part);
  const { label, icon } = getToolDisplay(part.toolName);
  const hasResult = part.result !== undefined;
  const resultIsString = typeof part.result === 'string';

  // Status indicator + tool icon + label, shared by both card shapes.
  const header = (
    <>
      {status === 'running' ? (
        <ActivityIndicator size="small" color={muted} />
      ) : (
        <Icon
          name={status === 'error' ? 'alert-circle' : 'checkmark-circle'}
          size={18}
          color={status === 'error' ? iconDanger : iconSuccess}
        />
      )}
      <Icon name={icon} size={16} color={muted} />
      <Text className="flex-1 text-text-primary text-sm font-medium" numberOfLines={1}>
        {label}
      </Text>
    </>
  );

  return (
    <Animated.View
      layout={LinearTransition}
      className="bg-surface border border-border-subtle rounded-xl my-1 overflow-hidden"
    >
      {isLookupTool(part.toolName) ? (
        // Lookup/search results are raw JSON for the model, not the user — show
        // just the labeled status with nothing to expand.
        <View className="flex-row items-center gap-2 px-3 py-2">{header}</View>
      ) : (
        <>
          <Pressable
            onPress={() => setExpanded((value) => !value)}
            className="flex-row items-center gap-2 px-3 py-2"
          >
            {header}
            <Icon name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color={muted} />
          </Pressable>

          {expanded && (
            <View className="px-3 pb-3">
              {hasResult ? (
                resultIsString ? (
                  // Tool results are complete (not streaming) and may carry markdown
                  // (the server's confirmation strings), rendered compact + secondary.
                  <MarkdownMessage
                    text={part.result as string}
                    color={secondary}
                    fontSize={14}
                    streaming={false}
                  />
                ) : (
                  <Text className="text-text-secondary text-xs" style={{ fontFamily: MONO_FONT }}>
                    {JSON.stringify(part.result, null, 2)}
                  </Text>
                )
              ) : (
                // No result yet (running) — show the streamed args, mirroring the web fallback.
                <Text className="text-text-muted text-xs" style={{ fontFamily: MONO_FONT }}>
                  {part.argsText}
                </Text>
              )}
            </View>
          )}
        </>
      )}
    </Animated.View>
  );
}
