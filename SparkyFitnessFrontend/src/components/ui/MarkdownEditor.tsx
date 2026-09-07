import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bold,
  Code,
  Heading2,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  Minimize2,
  Quote,
  Strikethrough,
  Table as TableIcon,
} from 'lucide-react';
import {
  NOTES_MAX_LENGTH,
  noteImageName,
  noteImageSnippet,
  applyToolbarAction,
  NOTE_TOOLBAR_ACTIONS,
  type ToolbarAction,
} from '@workspace/shared';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownView } from '@/components/ui/MarkdownView';
import { cn } from '@/lib/utils';

export { applyToolbarAction } from '@workspace/shared';

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
    action: NOTE_TOOLBAR_ACTIONS.bold,
  },
  {
    id: 'italic',
    icon: Italic,
    labelKey: 'markdownEditor.italic',
    labelFallback: 'Italic',
    action: NOTE_TOOLBAR_ACTIONS.italic,
  },
  {
    id: 'code',
    icon: Code,
    labelKey: 'markdownEditor.code',
    labelFallback: 'Code',
    action: NOTE_TOOLBAR_ACTIONS.code,
  },
  {
    id: 'link',
    icon: LinkIcon,
    labelKey: 'markdownEditor.link',
    labelFallback: 'Link',
    action: NOTE_TOOLBAR_ACTIONS.link,
  },
  {
    id: 'bulletList',
    icon: List,
    labelKey: 'markdownEditor.bulletList',
    labelFallback: 'Bulleted list',
    action: NOTE_TOOLBAR_ACTIONS.bulletList,
  },
  {
    id: 'numberedList',
    icon: ListOrdered,
    labelKey: 'markdownEditor.numberedList',
    labelFallback: 'Numbered list',
    action: NOTE_TOOLBAR_ACTIONS.numberedList,
  },
  {
    id: 'heading',
    icon: Heading2,
    labelKey: 'markdownEditor.heading',
    labelFallback: 'Heading',
    action: NOTE_TOOLBAR_ACTIONS.heading,
  },
  {
    id: 'strikethrough',
    icon: Strikethrough,
    labelKey: 'markdownEditor.strikethrough',
    labelFallback: 'Strikethrough',
    action: NOTE_TOOLBAR_ACTIONS.strikethrough,
  },
  {
    id: 'quote',
    icon: Quote,
    labelKey: 'markdownEditor.quote',
    labelFallback: 'Quote',
    action: NOTE_TOOLBAR_ACTIONS.quote,
  },
  {
    id: 'taskList',
    icon: ListChecks,
    // Reads as a checklist but renders as a non-interactive marker: GFM emits a
    // disabled checkbox, and ticking one would need per-note state to persist.
    labelKey: 'markdownEditor.taskList',
    labelFallback: 'Checklist (display only)',
    action: NOTE_TOOLBAR_ACTIONS.taskList,
  },
  {
    id: 'table',
    icon: TableIcon,
    labelKey: 'markdownEditor.table',
    labelFallback: 'Table',
    action: NOTE_TOOLBAR_ACTIONS.table,
  },
];

/** A photo the note may embed, already resolved for display in the picker. */
export interface NoteImageOption {
  /** Stored path, written into the markdown (`/uploads/...`). */
  path: string;
  /** Resolved src for the picker thumbnail. */
  src: string;
  /** Alt text seeded into the inserted markdown. */
  label?: string;
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
  /**
   * Photos belonging to the food, meal, or entry this note is attached to.
   * When non-empty an "insert image" button appears. Only saved images belong
   * here — a staged upload has no server path until the parent is saved.
   */
  imageOptions?: NoteImageOption[];
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
  imageOptions,
}) => {
  const { t } = useTranslation();
  // A note that already has text opens rendered — it is there to be read, and
  // raw markup is the less useful of the two views. An empty one opens in Write
  // so it can be typed into straight away.
  const [tab, setTab] = useState<'write' | 'preview'>(() =>
    value.trim() ? 'preview' : 'write'
  );
  // The value often arrives after mount (a food or entry fetched by a query),
  // so the initializer above sees "". Flip to Preview once when that happens.
  //
  // `userEngaged` is what keeps this from firing on the user's own typing:
  // without it, the first character typed into an empty note looks exactly like
  // a late-arriving value and throws them into Preview mid-word. Any deliberate
  // act — typing, a toolbar insert, picking a tab — means the view is theirs to
  // control from then on.
  //
  // Adjusted during render rather than in an effect: React re-runs the
  // component before committing, so the editor never paints in Write and then
  // visibly snaps to Preview the way an effect would make it. Both flags are
  // state, not refs, because they are read while rendering.
  const [userEngaged, setUserEngaged] = useState(false);
  const [autoPreviewed, setAutoPreviewed] = useState(() =>
    Boolean(value.trim())
  );
  if (!userEngaged && !autoPreviewed && value.trim()) {
    setAutoPreviewed(true);
    setTab('preview');
  }

  const selectTab = useCallback((next: 'write' | 'preview') => {
    setUserEngaged(true);
    setTab(next);
  }, []);

  /** Records that the change came from the user, not from loading data. */
  const handleUserChange = useCallback(
    (next: string) => {
      setUserEngaged(true);
      onChange(next);
    },
    [onChange]
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  // A recipe outgrows five rows fast, and the field sits at the bottom of a
  // dialog where there is room to spare.
  const [expanded, setExpanded] = useState(false);
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
      handleUserChange(result.text);
      // The value lands via React, so restore the caret after the re-render.
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
      });
    },
    [value, handleUserChange, maxLength]
  );

  // A staged upload is only a client-side placeholder until the parent is
  // saved, so it has no path a note could point at.
  const embeddableImages = React.useMemo(
    () =>
      (imageOptions ?? []).filter((image) =>
        image.path.startsWith('/uploads/')
      ),
    [imageOptions]
  );

  const previewImages = React.useMemo(
    () => embeddableImages.map((image) => image.path),
    [embeddableImages]
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
              onClick={() => selectTab(mode)}
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

        {/* Toolbar and the size toggle share the right-hand side; the toggle
            stays put when switching to Preview so it never jumps. */}
        <div className="flex flex-wrap items-center justify-end gap-0.5">
          {tab === 'write' && (
            <>
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

              {embeddableImages.length > 0 && (
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={disabled}
                      title={t('markdownEditor.insertImage', 'Insert photo')}
                      aria-label={t(
                        'markdownEditor.insertImage',
                        'Insert photo'
                      )}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 p-2">
                    <p className="mb-2 text-xs text-muted-foreground">
                      {t(
                        'markdownEditor.chooseImage',
                        'Insert one of this item’s photos'
                      )}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {embeddableImages.map((image, index) => (
                        <button
                          key={image.path}
                          type="button"
                          className="overflow-hidden rounded border hover:ring-2 hover:ring-ring focus:outline-none focus:ring-2 focus:ring-ring"
                          onClick={() => {
                            const alt =
                              image.label?.trim() ||
                              t('markdownEditor.imageAlt', 'photo {{number}}', {
                                number: index + 1,
                              });
                            // Just the file name: the directory is derivable
                            // from the owning entity, so putting it in the note
                            // only shows the user internal ids.
                            runAction(
                              noteImageSnippet(alt, noteImageName(image.path))
                            );
                            setPickerOpen(false);
                          }}
                        >
                          <img
                            src={image.src}
                            alt=""
                            className="h-14 w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-pressed={expanded}
            title={
              expanded
                ? t('markdownEditor.collapse', 'Shrink editor')
                : t('markdownEditor.expand', 'Expand editor')
            }
            aria-label={
              expanded
                ? t('markdownEditor.collapse', 'Shrink editor')
                : t('markdownEditor.expand', 'Expand editor')
            }
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {tab === 'write' ? (
        <Textarea
          id={id}
          ref={textareaRef}
          value={value}
          onChange={(e) => handleUserChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          rows={expanded ? 20 : rows}
          className="font-mono text-sm"
        />
      ) : (
        <div
          className={cn(
            'rounded-md border border-input bg-background px-3 py-2',
            expanded ? 'min-h-[460px]' : 'min-h-[120px]'
          )}
        >
          {value.trim() ? (
            <MarkdownView images={previewImages}>{value}</MarkdownView>
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
