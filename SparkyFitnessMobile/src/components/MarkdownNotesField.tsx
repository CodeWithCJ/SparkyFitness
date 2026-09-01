import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import {
  NOTES_MAX_LENGTH,
  NOTE_TOOLBAR_ACTIONS,
  applyToolbarAction,
  noteImageName,
  noteImageSnippet,
  type NoteToolbarActionId,
  type ToolbarAction,
} from '@workspace/shared';

import FormInput from './FormInput';
import Icon from './Icon';
import SafeImage from './SafeImage';
import { NoteMarkdown } from './NoteMarkdown';
import { useFoodImageSourceContext } from './FoodImageSourceProvider';

interface MarkdownNotesFieldProps {
  /** Committed note text (null/undefined → empty). Re-seeds the draft when it changes. */
  value: string | null | undefined;
  /** Called with the raw draft on blur; the parent owns trimming and the write. */
  onCommit: (text: string) => void;
  label?: string;
  placeholder?: string;
  accessibilityLabel?: string;
  /**
   * Stored paths of photos belonging to the entity this note hangs off. Shown
   * in the insert-photo picker and used to resolve references in Preview.
   */
  images?: readonly string[];
}

/**
 * Toolbar buttons, in display order.
 *
 * Labelled with text glyphs rather than icons: the shared `Icon` map has no
 * bold/italic/heading entries, and inventing SF Symbol names without verifying
 * them on-device risks silent blanks. `B`/`I`/`H2` read unambiguously in a
 * markdown toolbar anyway.
 */
const BUTTONS: {
  id: NoteToolbarActionId;
  glyph: string;
  /**
   * Takes `t` and calls it with a literal key: the i18n audit requires every
   * key to be statically analyzable, so `t(button.labelKey)` is rejected.
   */
  label: (t: TFunction) => string;
  style?: 'bold' | 'italic' | 'strike';
}[] = [
  {
    id: 'bold',
    glyph: 'B',
    label: (t) =>
      t('notes.toolbar.bold', {
        defaultValue: 'Bold',
      }),
    style: 'bold',
  },
  {
    id: 'italic',
    glyph: 'I',
    label: (t) =>
      t('notes.toolbar.italic', {
        defaultValue: 'Italic',
      }),
    style: 'italic',
  },
  {
    id: 'strikethrough',
    glyph: 'S',
    label: (t) =>
      t('notes.toolbar.strikethrough', {
        defaultValue: 'Strikethrough',
      }),
    style: 'strike',
  },
  {
    id: 'heading',
    glyph: 'H',
    label: (t) =>
      t('notes.toolbar.heading', {
        defaultValue: 'Heading',
      }),
  },
  {
    id: 'bulletList',
    glyph: '•',
    label: (t) =>
      t('notes.toolbar.bulletList', {
        defaultValue: 'Bulleted list',
      }),
  },
  {
    id: 'numberedList',
    glyph: '1.',
    label: (t) =>
      t('notes.toolbar.numberedList', {
        defaultValue: 'Numbered list',
      }),
  },
  {
    id: 'taskList',
    glyph: '☐',
    label: (t) =>
      t('notes.toolbar.taskList', {
        defaultValue: 'Checklist (display only)',
      }),
  },
  {
    id: 'quote',
    glyph: '❝',
    label: (t) =>
      t('notes.toolbar.quote', {
        defaultValue: 'Quote',
      }),
  },
  {
    id: 'code',
    glyph: '</>',
    label: (t) =>
      t('notes.toolbar.code', {
        defaultValue: 'Code',
      }),
  },
  {
    id: 'link',
    glyph: '🔗',
    label: (t) =>
      t('notes.toolbar.link', {
        defaultValue: 'Link',
      }),
  },
  {
    id: 'table',
    glyph: '▦',
    label: (t) =>
      t('notes.toolbar.table', {
        defaultValue: 'Table',
      }),
  },
];

/**
 * A labeled markdown notes field with a formatting toolbar and Write/Preview
 * modes, mirroring the web `MarkdownEditor`.
 *
 * Editing uses a plain multiline `FormInput` rather than the
 * `EnrichedMarkdownTextInput` that ships with `react-native-enriched-markdown`:
 * that component is a native WYSIWYG input, is currently unused anywhere in the
 * app, and would need its own theming and device verification inside these form
 * ScrollViews. Preview already renders the real markdown, so the user still
 * sees exactly what they wrote.
 *
 * The toolbar runs the same `applyToolbarAction` the web editor uses, so both
 * platforms write identical markdown from one tested implementation.
 *
 * Unlike `WorkoutNotesField`, this commits on every keystroke rather than on
 * blur alone. These forms save from a header button, which does not reliably
 * blur the field first, so a blur-only commit could drop the last thing typed.
 * The blur and unmount commits are kept as a backstop, and the draft is
 * re-seeded when the incoming `value` changes.
 */
function MarkdownNotesField({
  value,
  onCommit,
  label,
  placeholder,
  accessibilityLabel,
  images,
}: MarkdownNotesFieldProps) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t('notes.label', { defaultValue: 'Notes' });
  const resolvedPlaceholder =
    placeholder ??
    t('notes.placeholder', { defaultValue: 'Add a note… (supports markdown)' });

  const seeded = value ?? '';
  const [draft, setDraft] = useState(seeded);
  const [prevSeeded, setPrevSeeded] = useState(seeded);
  const [preview, setPreview] = useState(false);
  const [showImages, setShowImages] = useState(false);
  if (seeded !== prevSeeded) {
    setPrevSeeded(seeded);
    setDraft(seeded);
  }

  const inputRef = useRef<TextInput>(null);
  const selectionRef = useRef({ start: seeded.length, end: seeded.length });
  // Applied for one render after a toolbar insert, then released. Holding a
  // controlled `selection` permanently fights the platform on Android and makes
  // the caret jump while typing.
  const [pendingSelection, setPendingSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);

  const latest = useRef({ draft, seeded, onCommit });
  // eslint-disable-next-line react-hooks/refs
  latest.current = { draft, seeded, onCommit };

  useEffect(() => {
    return () => {
      const {
        draft: pending,
        seeded: committed,
        onCommit: commit,
      } = latest.current;
      if (pending !== committed) commit(pending);
    };
  }, []);

  // Commits on every keystroke, not only on blur. A header Save button does
  // not reliably blur the field first (the form ScrollViews use
  // `keyboardShouldPersistTaps`), so a blur-only commit could save the note as
  // it was before the last thing the user typed.
  const commitDraft = (text: string) => {
    setDraft(text);
    onCommit(text);
  };

  const togglePreview = () => {
    // Switching to Preview unmounts the input without a reliable blur, so
    // commit here rather than trusting the teardown flush to be enough.
    if (!preview && draft !== latest.current.seeded) onCommit(draft);
    setPreview((current) => !current);
  };

  const onSelectionChange = (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>
  ) => {
    selectionRef.current = event.nativeEvent.selection;
    // The platform has caught up with a programmatic move; stop forcing it.
    if (pendingSelection) setPendingSelection(null);
  };

  const runAction = (action: ToolbarAction) => {
    const { start, end } = selectionRef.current;
    const result = applyToolbarAction(action, draft, start, end);
    if (result.text.length > NOTES_MAX_LENGTH) return;
    commitDraft(result.text);
    selectionRef.current = {
      start: result.selectionStart,
      end: result.selectionEnd,
    };
    setPendingSelection({
      start: result.selectionStart,
      end: result.selectionEnd,
    });
    // Tapping a button outside the input can dismiss the keyboard; put the
    // caret back so the user can keep typing straight away.
    inputRef.current?.focus();
  };

  // Resolved here rather than by every caller: the field already needs the
  // stored paths for Preview, and the URI/header shape is an internal detail.
  const getImageSource = useFoodImageSourceContext();
  const photos = useMemo(
    () =>
      (images ?? []).flatMap((path) => {
        const source = getImageSource(path);
        return source ? [{ path, source }] : [];
      }),
    [images, getImageSource]
  );

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1">
        {resolvedLabel ? (
          <Text className="text-xs font-semibold uppercase text-text-muted">
            {resolvedLabel}
          </Text>
        ) : (
          <View />
        )}
        <Pressable
          onPress={togglePreview}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text className="text-xs font-semibold text-accent-primary">
            {preview
              ? t('notes.write', { defaultValue: 'Write' })
              : t('notes.preview', { defaultValue: 'Preview' })}
          </Text>
        </Pressable>
      </View>

      {preview ? (
        <View className="rounded-lg border border-border-subtle bg-raised px-3 py-2 min-h-[64px]">
          {draft.trim() ? (
            <NoteMarkdown text={draft} fontSize={14} images={images ?? []} />
          ) : (
            <Text className="text-sm italic text-text-muted">
              {t('notes.nothingToPreview', {
                defaultValue: 'Nothing to preview yet.',
              })}
            </Text>
          )}
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            className="mb-1.5"
            contentContainerStyle={{ gap: 4, paddingVertical: 2 }}
          >
            {BUTTONS.map((button) => (
              <Pressable
                key={button.id}
                onPress={() => runAction(NOTE_TOOLBAR_ACTIONS[button.id])}
                accessibilityRole="button"
                accessibilityLabel={button.label(t)}
                className="min-w-[36px] h-9 px-2 rounded-lg bg-raised border border-border-subtle items-center justify-center"
              >
                <Text
                  className="text-sm text-text-primary"
                  style={{
                    fontWeight: button.style === 'bold' ? '700' : '500',
                    fontStyle: button.style === 'italic' ? 'italic' : 'normal',
                    textDecorationLine:
                      button.style === 'strike' ? 'line-through' : 'none',
                  }}
                >
                  {button.glyph}
                </Text>
              </Pressable>
            ))}

            {photos.length > 0 ? (
              <Pressable
                onPress={() => setShowImages((current) => !current)}
                accessibilityRole="button"
                accessibilityLabel={t('notes.toolbar.insertImage', {
                  defaultValue: 'Insert photo',
                })}
                className="min-w-[36px] h-9 px-2 rounded-lg bg-raised border border-border-subtle items-center justify-center"
              >
                <Icon name="photo-library" size={16} />
              </Pressable>
            ) : null}
          </ScrollView>

          {showImages && photos.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              className="mb-1.5"
              contentContainerStyle={{ gap: 8 }}
            >
              {photos.map((photo, index) => (
                <Pressable
                  key={photo.path}
                  accessibilityRole="button"
                  accessibilityLabel={t('notes.toolbar.photoNumber', {
                    defaultValue: 'Photo {{number}}',
                    number: index + 1,
                  })}
                  onPress={() => {
                    const alt = t('notes.toolbar.photoNumber', {
                      defaultValue: 'Photo {{number}}',
                      number: index + 1,
                    });
                    runAction(noteImageSnippet(alt, noteImageName(photo.path)));
                    setShowImages(false);
                  }}
                >
                  <SafeImage
                    source={photo.source}
                    style={{ width: 56, height: 56, borderRadius: 8 }}
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <FormInput
            ref={inputRef}
            value={draft}
            onChangeText={commitDraft}
            onSelectionChange={onSelectionChange}
            selection={pendingSelection ?? undefined}
            onBlur={() => onCommit(draft)}
            placeholder={resolvedPlaceholder}
            accessibilityLabel={accessibilityLabel ?? resolvedLabel}
            multiline
            maxLength={NOTES_MAX_LENGTH}
            style={{ minHeight: 88, textAlignVertical: 'top' }}
          />
        </>
      )}
    </View>
  );
}

export default MarkdownNotesField;
