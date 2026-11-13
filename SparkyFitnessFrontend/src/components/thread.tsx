import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from '@/components/attachment';
import { MarkdownText } from '@/components/markdown-text';
import { Reasoning } from '@/components/reasoning';
import { ASK_USER_TOOL_NAME } from '@workspace/shared';
import { AskUserToolUI } from '@/components/ai/AskUserToolUI';
import { FoodPhotoEstimateToolUI } from '@/components/ai/FoodPhotoEstimateToolUI';
import { ToolFallback } from '@/components/tool-fallback';
import { TooltipIconButton } from '@/components/tooltip-icon-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useAui,
} from '@assistant-ui/react';
import type {
  AssistantRuntime,
  SourceMessagePartProps,
} from '@assistant-ui/react';
import { getThreadMessageTokenUsage } from '@assistant-ui/react-ai-sdk';
import { useChatbotVisibility } from '@/contexts/ChatbotVisibilityContext';
import { ChatToolCategoriesSelector } from '@/components/ai/ChatToolCategoriesSelector';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
} from 'lucide-react';
import { Fragment, useRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useUserAIPreferences } from '@/hooks/AI/useAIServiceSettings';
import { useVoiceInput } from '@/hooks/AI/useVoiceInput';
import { VoiceInputControl } from '@/components/ai/VoiceInputControl';

interface ThreadProps {
  runtime?: AssistantRuntime;
  welcome?: { message?: string };
}

export const Thread: FC<ThreadProps> = ({ runtime }) => {
  if (runtime) {
    return (
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadInner />
      </AssistantRuntimeProvider>
    );
  }
  return <ThreadInner />;
};

const ThreadInner: FC = () => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root bg-background @container flex h-full flex-col"
      style={{
        ['--thread-max-width' as string]: '44rem',
        ['--composer-radius' as string]: '24px',
        ['--composer-padding' as string]: '10px',
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
      >
        <div className="mx-auto flex w-full max-w-[44rem] flex-1 flex-col px-4 pt-4">
          <AuiIf condition={(s) => s.thread.isEmpty}>
            <ThreadWelcome />
          </AuiIf>

          <div
            data-slot="aui_message-group"
            className="mb-10 flex flex-col gap-y-8 empty:hidden"
          >
            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer bg-background sticky bottom-0 mt-auto flex flex-col gap-4 overflow-visible pb-4 md:pb-6">
            <ThreadScrollToBottom />
            <SessionTokenUsage />
            <Composer />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  if (isEditing) return <EditComposer />;
  if (role === 'user') return <UserMessage />;
  return <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => {
  const { t } = useTranslation();
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip={t('thread.scrollToBottom', 'Scroll to bottom')}
        variant="outline"
        className="aui-thread-scroll-to-bottom dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  const { t } = useTranslation();
  return (
    <div className="aui-thread-welcome-root my-auto flex grow flex-col">
      <div className="aui-thread-welcome-center flex w-full grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col justify-center px-4">
          <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-semibold duration-200">
            {t('thread.helloThere', 'Hello there!')}
          </h1>
          <p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-muted-foreground text-xl delay-75 duration-200">
            {t('thread.howCanIHelpYou', 'How can I help you today?')}
          </p>
        </div>
      </div>
      <ThreadSuggestions />
    </div>
  );
};

const WELCOME_SUGGESTIONS = [
  'Log two eggs and a banana for breakfast',
  'Log a 30 minute run today',
  'How many calories do I have left today?',
  'Suggest a high-protein snack',
];

const ThreadSuggestions: FC = () => {
  return (
    <div className="aui-thread-welcome-suggestions grid w-full gap-2 pb-4 @md:grid-cols-2">
      {WELCOME_SUGGESTIONS.map((prompt) => (
        <ThreadSuggestionItem key={prompt} prompt={prompt} />
      ))}
    </div>
  );
};

const ThreadSuggestionItem: FC<{ prompt: string }> = ({ prompt }) => {
  return (
    <div className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 animate-in fill-mode-both duration-200">
      {/* <div className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 animate-in fill-mode-both duration-200 nth-[n+3]:hidden @md:nth-[n+3]:block"> */}
      <ThreadPrimitive.Suggestion prompt={prompt} clearComposer asChild>
        <Button
          variant="ghost"
          className="aui-thread-welcome-suggestion bg-background hover:bg-muted h-auto w-full flex-wrap items-start justify-start gap-1 rounded-3xl border px-4 py-3 text-start text-sm font-medium transition-colors @md:flex-col"
        >
          {prompt}
        </Button>
      </ThreadPrimitive.Suggestion>
    </div>
  );
};

const Composer: FC = () => {
  const { t, i18n } = useTranslation();
  const aui = useAui();
  const running = useAuiState((state) => state.thread.isRunning);
  const { data: preferences } = useUserAIPreferences();
  const voiceEnabled =
    !!preferences && preferences.voice_input_enabled !== false;
  const waveformRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceInput({
    enabled: voiceEnabled && !running,
    serviceId: preferences?.active_voice_ai_service_id ?? null,
    language: i18n.language,
    getText: () => aui.composer().getState().text,
    setText: (text) => aui.composer().setText(text),
    onLevel: (level) =>
      waveformRef.current?.style.setProperty('--voice-level', String(level)),
  });
  return (
    <ComposerPrimitive.Root
      className="aui-composer-root relative flex w-full flex-col"
      onSubmitCapture={(event) => {
        if (voice.busy) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <ComposerPrimitive.AttachmentDropzone asChild>
        <div
          data-slot="aui_composer-shell"
          className="bg-background focus-within:border-ring/75 focus-within:ring-ring/20 data-[dragging=true]:border-ring data-[dragging=true]:bg-accent/50 flex w-full flex-col gap-2 rounded-(--composer-radius) border p-(--composer-padding) transition-shadow focus-within:ring-2 data-[dragging=true]:border-dashed"
        >
          <ComposerAttachments />
          <ComposerPrimitive.Input
            disabled={voice.busy}
            placeholder={t('thread.sendAMessage', 'Send a message...')}
            className="aui-composer-input placeholder:text-muted-foreground/80 max-h-32 min-h-10 w-full resize-none bg-transparent px-1.75 py-1 text-sm outline-none"
            rows={1}
            autoFocus
            aria-label={t('thread.messageInput', 'Message input')}
          />
          <div className="aui-composer-action-wrapper relative flex items-start justify-between gap-2">
            <div
              className={cn(
                'flex items-center gap-1',
                voice.busy && 'pointer-events-none opacity-50'
              )}
              inert={voice.busy}
            >
              <ComposerAddAttachment />
              <ChatToolCategoriesSelector />
            </div>
            <div className="flex flex-col items-end gap-2">
              {voiceEnabled && !running ? (
                <VoiceInputControl {...voice} waveformRef={waveformRef}>
                  <ComposerAction disabled={voice.busy} />
                </VoiceInputControl>
              ) : (
                <ComposerAction disabled={voice.busy} />
              )}
            </div>
          </div>
        </div>
      </ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC<{ disabled: boolean }> = ({ disabled }) => {
  const { t } = useTranslation();
  return (
    <>
      <AuiIf condition={(s) => !s.thread.isRunning}>
        <ComposerPrimitive.Send asChild disabled={disabled}>
          <TooltipIconButton
            tooltip={t('thread.sendMessage', 'Send message')}
            side="bottom"
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-send size-8 rounded-full"
            aria-label={t('thread.sendMessage', 'Send message')}
          >
            <ArrowUpIcon className="aui-composer-send-icon size-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <Button
            type="button"
            variant="default"
            size="icon"
            className="aui-composer-cancel size-8 rounded-full"
            aria-label={t('thread.stopGenerating', 'Stop generating')}
          >
            <SquareIcon className="aui-composer-cancel-icon size-3 fill-current" />
          </Button>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

type TokenUsageCounts = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
};

// Muted/small token-usage line. Cache reads cost a fraction of fresh input, so
// a turn that is mostly cache reads looks far costlier as one big total than it
// is. Input is split into cached and uncached, so cached + uncached + out add
// up to the total. Without a cached figure (provider reports none, or 0) input
// stays a single "in" segment. Counts are compact ("66.9K") so the line fits
// beside the action bar on phones; the title carries the exact numbers. With
// `label` set (the session running total) the line is prefixed "label: ".
export const TokenUsageLine: FC<
  TokenUsageCounts & { label?: string; className?: string }
> = ({
  inputTokens,
  outputTokens,
  totalTokens,
  cachedInputTokens,
  label,
  className,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const compact = new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const exact = new Intl.NumberFormat(locale);

  const total =
    totalTokens ??
    (inputTokens !== undefined && outputTokens !== undefined
      ? inputTokens + outputTokens
      : undefined);
  const cached = cachedInputTokens || undefined;
  const uncached =
    cached !== undefined && inputTokens !== undefined
      ? Math.max(inputTokens - cached, 0)
      : undefined;

  const segments = (format: (n: number) => string) =>
    [
      total !== undefined &&
        t('thread.tokenUsage.total', '{{value}} total', {
          value: format(total),
        }),
      cached !== undefined &&
        t('thread.tokenUsage.cached', '{{value}} cached', {
          value: format(cached),
        }),
      uncached !== undefined &&
        t('thread.tokenUsage.uncached', '{{value}} uncached', {
          value: format(uncached),
        }),
      cached === undefined &&
        inputTokens !== undefined &&
        t('thread.tokenUsage.input', '{{value}} in', {
          value: format(inputTokens),
        }),
      outputTokens !== undefined &&
        t('thread.tokenUsage.output', '{{value}} out', {
          value: format(outputTokens),
        }),
    ].filter((s): s is string => Boolean(s));

  const prefix = label ? `${label}: ` : '';
  // Each segment stays on one line, so a narrow panel wraps between segments
  // rather than splitting "1.3K uncached" across lines.
  return (
    <span
      data-slot="aui_token-usage-line"
      title={prefix + segments((n) => exact.format(n)).join(' · ')}
      className={cn('text-muted-foreground text-xs', className)}
    >
      {prefix}
      {segments((n) => compact.format(n)).map((segment, i) => (
        <Fragment key={segment}>
          {i > 0 && ' · '}
          <span className="whitespace-nowrap">{segment}</span>
        </Fragment>
      ))}
    </span>
  );
};

// Per-message footer: the usage for this assistant reply. Gated on the
// pure-local toggle; renders nothing mid-stream or when the provider reported
// no usage (getThreadMessageTokenUsage returns undefined).
export const MessageTokenUsage: FC = () => {
  const { showTokenStats } = useChatbotVisibility();
  const message = useAuiState((s) => s.message);
  if (!showTokenStats) return null;
  const usage = getThreadMessageTokenUsage(message);
  if (!usage) return null;
  return (
    <TokenUsageLine
      className="ms-2"
      inputTokens={usage.inputTokens}
      outputTokens={usage.outputTokens}
      totalTokens={usage.totalTokens}
      cachedInputTokens={usage.cachedInputTokens}
    />
  );
};

// Add up the session's usage over the messages that reported a total (derived
// from input + output when the provider sent no total). A breakdown field is
// shown only when every counted message reported it, so the segments always
// cover the same messages as the total. A missing cached count means none.
const sumSessionUsage = (
  usages: TokenUsageCounts[]
): TokenUsageCounts | undefined => {
  const counted = usages.flatMap((u) => {
    const totalTokens =
      u.totalTokens ??
      (u.inputTokens !== undefined && u.outputTokens !== undefined
        ? u.inputTokens + u.outputTokens
        : undefined);
    return totalTokens === undefined ? [] : [{ ...u, totalTokens }];
  });
  if (counted.length === 0) return undefined;
  const sum = (key: keyof TokenUsageCounts) =>
    counted.every((u) => u[key] !== undefined)
      ? counted.reduce((total, u) => total + (u[key] ?? 0), 0)
      : undefined;
  const inputTokens = sum('inputTokens');
  return {
    totalTokens: sum('totalTokens'),
    inputTokens,
    outputTokens: sum('outputTokens'),
    cachedInputTokens:
      inputTokens === undefined
        ? undefined
        : counted.reduce((total, u) => total + (u.cachedInputTokens ?? 0), 0),
  };
};

// Session running total near the composer. The adapter helpers give
// latest-or-single, not a sum, so add up every message's usage. History
// messages restored without metadata return undefined usage and are skipped.
// "this session" signals the count is current-session-only — it resets on
// reload (see known limitations).
export const SessionTokenUsage: FC = () => {
  const { t } = useTranslation();
  const { showTokenStats } = useChatbotVisibility();
  const messages = useAuiState((s) => s.thread.messages);
  if (!showTokenStats) return null;
  const usage = sumSessionUsage(
    messages
      .map((m) => getThreadMessageTokenUsage(m))
      .filter((u): u is TokenUsageCounts => u !== undefined)
  );
  if (!usage?.totalTokens) return null;
  return (
    <TokenUsageLine
      className="px-1"
      label={t('thread.thisSession', 'this session')}
      {...usage}
    />
  );
};

const FoodResearchSource: FC<SourceMessagePartProps> = ({ url, title }) => {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block text-sm text-primary underline"
    >
      {title || url}
    </a>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="fade-in slide-in-from-bottom-1 animate-in relative duration-150"
    >
      <div
        data-slot="aui_assistant-message-content"
        className="text-foreground px-2 leading-relaxed wrap-break-word"
      >
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
            Reasoning: Reasoning,
            Source: FoodResearchSource,
            tools: {
              by_name: {
                [ASK_USER_TOOL_NAME]: AskUserToolUI,
                sparky_analyze_food_image: FoodPhotoEstimateToolUI,
              },
              Fallback: ToolFallback,
            },
          }}
        />
        <MessageError />
      </div>

      <div
        data-slot="aui_assistant-message-footer"
        className="ms-2 flex items-center pt-1.5"
      >
        <BranchPicker />
        <AssistantActionBar />
        <MessageTokenUsage />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  const { t } = useTranslation();
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root text-muted-foreground col-start-3 row-start-2 -ms-1 flex gap-1"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip={t('thread.copy', 'Copy')}>
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip={t('thread.refresh', 'Refresh')}>
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <TooltipIconButton
            tooltip={t('thread.more', 'More')}
            className="data-[state=open]:bg-accent"
          >
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          className="aui-action-bar-more-content bg-popover text-popover-foreground z-50 min-w-32 overflow-hidden rounded-md border p-1 shadow-md"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className="aui-action-bar-more-item hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none">
              <DownloadIcon className="size-4" />
              {t('thread.exportAsMarkdown', 'Export as Markdown')}
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [contain-intrinsic-size:auto_60px] [content-visibility:auto] [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content peer bg-muted text-foreground rounded-2xl px-4 py-2.5 wrap-break-word empty:hidden">
          <MessagePrimitive.Parts />
        </div>
        <div className="aui-user-action-bar-wrapper absolute start-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2 peer-empty:hidden rtl:translate-x-full">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -me-1 justify-end"
      />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  const { t } = useTranslation();
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton
          tooltip={t('common.edit', 'Edit')}
          className="aui-user-action-edit p-4"
        >
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  const { t } = useTranslation();
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2"
    >
      <ComposerPrimitive.Root className="aui-edit-composer-root bg-muted ms-auto flex w-full max-w-[85%] flex-col rounded-2xl">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input text-foreground min-h-14 w-full resize-none bg-transparent p-4 text-sm outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-3 mb-3 flex items-center gap-2 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm">
              {t('common.cancel', 'Cancel')}
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm">{t('thread.update', 'Update')}</Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  const { t } = useTranslation();
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        'aui-branch-picker-root text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs',
        className
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip={t('common.previous', 'Previous')}>
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip={t('common.next', 'Next')}>
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
