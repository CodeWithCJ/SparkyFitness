type Translate = (key: string, options?: Record<string, unknown>) => string;

export function humanizeChatKey(value: string): string {
  const words = value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function getLocalizedToolLabel(
  t: Translate,
  labelKey: string | undefined,
  defaultLabel: string
): string {
  if (labelKey === 'chat.tools.lookedUp')
    return t(labelKey, { name: defaultLabel });
  return labelKey ? t(labelKey) : defaultLabel;
}

export interface ToolDisplay {
  labelKey?: string;
  defaultLabel: string;
  icon: 'food' | 'exercise' | 'measurements' | 'flame' | 'search' | 'wrench';
}

const TOOL_DISPLAY: Record<string, ToolDisplay> = {
  sparky_manage_food: {
    labelKey: 'chat.tools.food',
    defaultLabel: '',
    icon: 'food',
  },
  sparky_manage_exercise: {
    labelKey: 'chat.tools.exercise',
    defaultLabel: '',
    icon: 'exercise',
  },
  sparky_manage_checkin: {
    labelKey: 'chat.tools.checkin',
    defaultLabel: '',
    icon: 'measurements',
  },
  sparky_manage_run_program: {
    labelKey: 'chat.tools.runProgram',
    defaultLabel: '',
    icon: 'exercise',
  },
  sparky_manage_goals: {
    labelKey: 'chat.tools.goals',
    defaultLabel: '',
    icon: 'flame',
  },
};

export function isLookupTool(toolName: string): boolean {
  return /^sparky_get_/.test(toolName);
}

export function getToolDisplay(toolName: string): ToolDisplay {
  const explicit = TOOL_DISPLAY[toolName];
  if (explicit) return explicit;

  const lookup = toolName.match(/^sparky_get_(.+)$/);
  if (lookup) {
    return {
      labelKey: 'chat.tools.lookedUp',
      defaultLabel: humanizeChatKey(lookup[1] ?? '').toLowerCase(),
      icon: 'search',
    };
  }

  return {
    labelKey: 'chat.tools.generic',
    defaultLabel: '',
    icon: 'wrench',
  };
}

export function chatOutsideToolTitle(
  t: Translate,
  name: string,
  sources: { toolTitles: Record<string, string> }
): string {
  return (
    sources.toolTitles[name]?.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() ||
    t('chat.tools.outside')
  );
}

export function chatToolLabel(
  t: Translate,
  name: string,
  sources: {
    toolServers: Record<string, string>;
    toolTitles: Record<string, string>;
  },
  action?: unknown
): string {
  if (name.startsWith('mcp_')) {
    const server = sources.toolServers[name];
    const title = chatOutsideToolTitle(t, name, sources);
    return server && sources.toolTitles[name]?.trim()
      ? t('chat.tools.outsideNamed', { server, tool: title })
      : t('chat.tools.outside');
  }
  const display = getToolDisplay(name);
  const label = getLocalizedToolLabel(
    t,
    display.labelKey,
    display.defaultLabel
  );
  return typeof action === 'string' && action.trim()
    ? t('chat.tools.withAction', {
        tool: label,
        action: action.replace(/_/g, ' ').replace(/\s+/g, ' ').trim(),
      })
    : label;
}

export function chatPreviewValue(
  value: unknown,
  locale?: string,
  now = new Date()
): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return String(value);
  const date = new Date(`${value}T12:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return value;
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(date.getUTCFullYear() !== now.getFullYear()
      ? { year: 'numeric' as const }
      : {}),
    timeZone: 'UTC',
  }).format(date);
}

export function chatApprovalDescriptionKey(
  variant:
    | 'run'
    | 'runPlain'
    | 'send'
    | 'delete'
    | 'deleteAfter'
    | 'change'
    | 'changeAfter',
  state: { pending: boolean; working: boolean; failed: boolean; title: string }
): string {
  // Allowed but not finished (or held behind another card) keeps "wants to":
  // a past-tense sentence would claim a change that has not happened.
  const tense =
    state.pending || state.working
      ? ''
      : state.failed
        ? 'Failed'
        : state.title === 'allowed'
          ? 'Completed'
          : 'Unused';
  return `chat.approval.${variant}${tense}`;
}

export function chatArgsPreview(
  args: Record<string, unknown>,
  locale?: string
): string {
  return Object.entries(args)
    .filter(
      ([key, value]) =>
        key !== 'action' &&
        value !== undefined &&
        (typeof value !== 'object' || value === null)
    )
    .slice(0, 3)
    .map(([key, value]) => {
      const unit = key.match(
        /_(ml|g|kg|lbs|lb|oz|km|mi|min|minutes|seconds|kcal)$/
      );
      const label = unit ? key.slice(0, -unit[0].length) : key;
      return `${humanizeChatKey(label)}: ${chatPreviewValue(value, locale)}${unit ? ` ${unit[1]}` : ''}`;
    })
    .join(' · ');
}

export function chatServerList(servers: string[], locale?: string): string {
  const names = [...new Set(servers)];
  try {
    return new Intl.ListFormat(locale, {
      style: 'long',
      type: 'conjunction',
    }).format(names);
  } catch {
    return names.join(', ');
  }
}

export function outsideToolResult(result: unknown): {
  text: string;
  isError: boolean;
  code?: 'unavailable' | 'turnedOff';
} {
  const value =
    result &&
    typeof result === 'object' &&
    'error' in result &&
    typeof result.error === 'string'
      ? result.error
      : result;
  const raw =
    typeof value === 'string'
      ? value
      : value === undefined
        ? ''
        : JSON.stringify(value, null, 2);
  const text = raw
    .replace(/^\s*<outside_tool_result\b[^>]*>\s*/i, '')
    .replace(/\s*<\/outside_tool_result>\s*$/i, '')
    .replace(/\n\s*Suggestion:[\s\S]*$/i, '')
    .trim();
  const isError = /^Error \[/.test(text);
  const code = /^Error \[EXTERNAL_TOOL_UNAVAILABLE\]/.test(text)
    ? 'unavailable'
    : /^Error \[(?:EXTERNAL_TOOL_DISABLED|EXTERNAL_TOOL_NOT_ENABLED)\]/.test(
          text
        )
      ? 'turnedOff'
      : /^Error \[FORBIDDEN\].*(?:not enabled|turned off|not turned this server on|not allowed.*chat)/i.test(
            text
          )
        ? 'turnedOff'
        : undefined;
  return { text: isError ? (text.split('\n')[0] ?? '') : text, isError, code };
}

export function chatResultText(
  t: Translate,
  result: unknown,
  server: string
): string {
  const cleaned = outsideToolResult(result);
  return cleaned.code
    ? t(`chat.outsideError.${cleaned.code}`, { server })
    : cleaned.text;
}

export function chatApprovalState(
  approval:
    { approved?: boolean; resolution?: string; reason?: string } | undefined,
  answer: boolean | undefined,
  result: unknown,
  isError: boolean,
  laterMessage: boolean
) {
  const approved = approval?.approved ?? answer;
  const cancelled =
    approval?.resolution === 'cancelled' ||
    approval?.reason === 'A new user message cancelled this call.' ||
    (approved === undefined && laterMessage);
  const notRun =
    cancelled || (approved === undefined && !!approval?.resolution);
  const pending = approved === undefined && !approval?.resolution && !cancelled;
  const failed =
    approved === true && (isError || outsideToolResult(result).isError);
  const working = approved === true && result === undefined && !failed;
  return {
    pending,
    working,
    failed,
    title: pending
      ? 'title'
      : notRun
        ? 'notRun'
        : approved === false
          ? 'denied'
          : failed
            ? 'toolFailed'
            : 'allowed',
    status:
      pending || failed || (notRun && !cancelled)
        ? undefined
        : cancelled
          ? 'cancelled'
          : approved === false
            ? 'nothingChanged'
            : working
              ? 'working'
              : 'done',
  } as const;
}
