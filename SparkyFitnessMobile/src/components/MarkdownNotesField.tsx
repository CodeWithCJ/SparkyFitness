import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { NOTES_MAX_LENGTH } from '@workspace/shared';

import FormInput from './FormInput';
import MarkdownMessage from './chat/MarkdownMessage';

interface MarkdownNotesFieldProps {
  /** Committed note text (null/undefined → empty). Re-seeds the draft when it changes. */
  value: string | null | undefined;
  /** Called with the raw draft on blur; the parent owns trimming and the write. */
  onCommit: (text: string) => void;
  label?: string;
  placeholder?: string;
  accessibilityLabel?: string;
}

/**
 * A labeled markdown notes field with Write/Preview modes, mirroring the web
 * `MarkdownEditor`.
 *
 * Editing uses a plain multiline `FormInput` rather than the
 * `EnrichedMarkdownTextInput` that ships with `react-native-enriched-markdown`:
 * that component is a native WYSIWYG input, is currently unused anywhere in the
 * app, and would need its own theming and device verification inside these form
 * ScrollViews. Every other notes field in the app is a multiline `FormInput`,
 * and Preview already renders the real markdown, so the user still sees exactly
 * what they wrote. Swapping in the native input later is a change confined to
 * this file.
 *
 * The draft/commit lifecycle is deliberately identical to
 * `WorkoutNotesField`: commit on blur, flush again on unmount (RN may tear the
 * field down before delivering a native blur to JS), and re-seed the draft when
 * the incoming `value` changes. Commits never fire mid-edit, so a re-seed
 * cannot clobber text the user is typing.
 */
function MarkdownNotesField({
  value,
  onCommit,
  label,
  placeholder,
  accessibilityLabel,
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
  if (seeded !== prevSeeded) {
    setPrevSeeded(seeded);
    setDraft(seeded);
  }

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

  const togglePreview = () => {
    // Switching to Preview unmounts the input without a reliable blur, so
    // commit here rather than trusting the teardown flush to be enough.
    if (!preview && draft !== latest.current.seeded) onCommit(draft);
    setPreview((current) => !current);
  };

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
            <MarkdownMessage text={draft} streaming={false} fontSize={14} />
          ) : (
            <Text className="text-sm italic text-text-muted">
              {t('notes.nothingToPreview', {
                defaultValue: 'Nothing to preview yet.',
              })}
            </Text>
          )}
        </View>
      ) : (
        <FormInput
          value={draft}
          onChangeText={setDraft}
          onBlur={() => onCommit(draft)}
          placeholder={resolvedPlaceholder}
          accessibilityLabel={accessibilityLabel ?? resolvedLabel}
          multiline
          maxLength={NOTES_MAX_LENGTH}
          style={{ minHeight: 88, textAlignVertical: 'top' }}
        />
      )}
    </View>
  );
}

export default MarkdownNotesField;
