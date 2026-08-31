import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bold,
  Code,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
} from 'lucide-react';
import { NOTES_MAX_LENGTH } from '@workspace/shared';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownView } from '@/components/ui/MarkdownView';
import { cn } from '@/lib/utils';

/**
 * How a toolbar button changes the text.
 *
 * `wrap` surrounds the selection (bold, code); `linePrefix` prefixes every
 * selected line (lists). `placeholder` is what gets inserted and selected when
 * the user clicks with nothing selected, so the button is still useful from an
 * empty caret.
 */
type ToolbarAction =
  | { kind: 'wrap'; before: string; after: string; placeholder: string }
  | { kind: 'linePrefix'; prefix: string | ((index: number) => string) };

interface ToolbarButton {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  labelFallback: string;
  action: ToolbarAction;
}

const TOOLBAR: ToolbarButton[] = [
  {
    id: 'bold',
    icon: Bold,
    labelKey: 'markdownEditor.bold',
    labelFallback: 'Bold',
    action: { kind: 'wrap', before: '**', after: '**', placeholder: 'bold' },
  },
  {
    id: 'italic',
    icon: Italic,
    labelKey: 'markdownEditor.italic',
    labelFallback: 'Italic',
    action: { kind: 'wrap', before: '_', after: '_', placeholder: 'italic' },
  },
  {
    id: 'code',
    icon: Code,
    labelKey: 'markdownEditor.code',
    labelFallback: 'Code',
    action: { kind: 'wrap', before: '`', after: '`', placeholder: 'code' },
  },
  {
    id: 'link',
    icon: LinkIcon,
    labelKey: 'markdownEditor.link',
    labelFallback: 'Link',
    action: { kind: 'wrap', before: '[', after: '](url)', placeholder: 'text' },
  },
  {
    id: 'bulletList',
    icon: List,
    labelKey: 'markdownEditor.bulletList',
    labelFallback: 'Bulleted list',
    action: { kind: 'linePrefix', prefix: '- ' },
  },
  {
    id: 'numberedList',
    icon: ListOrdered,
    labelKey: 'markdownEditor.numberedList',
    labelFallback: 'Numbered list',
    action: { kind: 'linePrefix', prefix: (index: number) => `${index + 1}. ` },
  },
];

interface ApplyResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Pure text transform for one toolbar button, so the selection maths is
 * testable without a DOM.
 */
export function applyToolbarAction(
  action: ToolbarAction,
  text: string,
  selectionStart: number,
  selectionEnd: number
): ApplyResult {
  if (action.kind === 'wrap') {
    const selected = text.slice(selectionStart, selectionEnd);
    const body = selected || action.placeholder;
    const inserted = `${action.before}${body}${action.after}`;
    return {
      text: text.slice(0, selectionStart) + inserted + text.slice(selectionEnd),
      // Select the body, not the markers, so typing replaces the placeholder.
      selectionStart: selectionStart + action.before.length,
      selectionEnd: selectionStart + action.before.length + body.length,
    };
  }

  // Expand the selection to whole lines: a list marker belongs at line start,
  // not wherever the user happened to click.
  const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEndIndex = text.indexOf('\n', selectionEnd);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;

  const block = text.slice(lineStart, lineEnd);
  const prefixed = block
    .split('\n')
    .map((line, index) =>
      typeof action.prefix === 'string'
        ? `${action.prefix}${line}`
        : `${action.prefix(index)}${line}`
    )
    .join('\n');

  return {
    text: text.slice(0, lineStart) + prefixed + text.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + prefixed.length,
  };
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
  rows?: number;
}

/**
 * A GitHub-style markdown editor: a Write mode with a small formatting
 * toolbar, and a Preview mode rendering the same text through
 * {@link MarkdownView}.
 */
export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  id,
  placeholder,
  disabled = false,
  maxLength = NOTES_MAX_LENGTH,
  className,
  rows = 5,
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const runAction = useCallback(
    (action: ToolbarAction) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const result = applyToolbarAction(
        action,
        value,
        textarea.selectionStart,
        textarea.selectionEnd
      );
      if (result.text.length > maxLength) return;
      onChange(result.text);
      // The value lands via React, so restore the caret after the re-render.
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
      });
    },
    [value, onChange, maxLength]
  );

  const remaining = maxLength - value.length;
  const showRemaining = remaining <= maxLength * 0.1;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        {/*
          A plain two-button toggle rather than Radix Tabs: Write and Preview
          show the same field two ways, so there are no tab panels to label,
          and `role="tab"` without a `tabpanel` is a lie to screen readers.
        */}
        <div className="inline-flex items-center rounded-md bg-muted p-0.5">
          {(['write', 'preview'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={tab === mode}
              onClick={() => setTab(mode)}
              className={cn(
                'rounded-sm px-2 py-1 text-xs font-medium transition-colors',
                tab === mode
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {mode === 'write'
                ? t('markdownEditor.write', 'Write')
                : t('markdownEditor.preview', 'Preview')}
            </button>
          ))}
        </div>

        {tab === 'write' && (
          <div className="flex items-center gap-0.5">
            {TOOLBAR.map(
              ({
                id: actionId,
                icon: Icon,
                labelKey,
                labelFallback,
                action,
              }) => (
                <Button
                  key={actionId}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={disabled}
                  title={t(labelKey, labelFallback)}
                  aria-label={t(labelKey, labelFallback)}
                  onClick={() => runAction(action)}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              )
            )}
          </div>
        )}
      </div>

      {tab === 'write' ? (
        <Textarea
          id={id}
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          rows={rows}
          className="font-mono text-sm"
        />
      ) : (
        <div className="min-h-[120px] rounded-md border border-input bg-background px-3 py-2">
          {value.trim() ? (
            <MarkdownView>{value}</MarkdownView>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {t('markdownEditor.nothingToPreview', 'Nothing to preview yet.')}
            </p>
          )}
        </div>
      )}

      {showRemaining && (
        <p className="text-xs text-muted-foreground text-right">
          {t(
            'markdownEditor.charactersRemaining',
            '{{count}} characters left',
            {
              count: remaining,
            }
          )}
        </p>
      )}
    </div>
  );
};

export default MarkdownEditor;
