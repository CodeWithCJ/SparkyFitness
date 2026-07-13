import {
  useMessage,
  useThread,
  useThreadRuntime,
  type ToolCallMessagePartComponent,
} from '@assistant-ui/react';
import { MIN_ASK_USER_OPTIONS, type AskUserInput } from '@workspace/shared';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Renders the `sparky_ask_user` tool call as tappable quick-reply chips.
 *
 * Tapping a chip sends its text as an ordinary user message, so the model sees
 * a normal reply ("75g each") rather than a special event — no client-side tool
 * result is needed, and typing the answer by hand behaves identically.
 *
 * The question is always asked BEFORE the action, so nothing has been logged
 * yet when these chips appear. See @workspace/shared/constants/chatAskUser.
 */
export const AskUserToolUI: ToolCallMessagePartComponent<AskUserInput> = ({
  args,
}) => {
  const threadRuntime = useThreadRuntime();
  const isLast = useMessage((m) => m.isLast);
  const isRunning = useThread((t) => t.isRunning);

  // The tool input streams in as partial JSON, so `options` is briefly absent
  // or half-built. Rendering it early flashes a one-item or empty chip row.
  const options = Array.isArray(args?.options) ? args.options : [];
  if (options.length < MIN_ASK_USER_OPTIONS) return null;

  // Chips on an older message would re-send a stale answer to a question that
  // has already moved on, so they only stay live on the final message.
  const disabled = !isLast || isRunning;

  const send = (option: string) => {
    threadRuntime.append({
      role: 'user',
      content: [{ type: 'text', text: option }],
    });
  };

  return (
    <div className="aui-ask-user-root my-2 flex flex-col gap-2">
      {args?.question && (
        <p className="aui-ask-user-question text-muted-foreground text-sm">
          {args.question}
        </p>
      )}
      <div className="aui-ask-user-options flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option}
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => send(option)}
            className={cn(
              'aui-ask-user-option bg-background hover:bg-muted h-auto rounded-3xl border px-3 py-1.5 text-sm font-medium transition-colors',
              disabled && 'pointer-events-none opacity-50'
            )}
          >
            {option}
          </Button>
        ))}
      </div>
    </div>
  );
};
