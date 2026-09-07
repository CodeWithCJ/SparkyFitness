import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import MarkdownMessage from './chat/MarkdownMessage';
import SafeImage from './SafeImage';
import { useFoodImageSourceContext } from './FoodImageSourceProvider';
import { splitNoteSegments } from '../utils/markdownImages';

interface NoteMarkdownProps {
  text: string | null | undefined;
  fontSize?: number;
  color?: string;
  /**
   * Stored image paths this note may embed — the owning food's or meal's
   * photos, plus a diary entry's own overrides. A reference matching none of
   * them is left in the text as written.
   */
  images?: readonly string[];
}

/**
 * Renders a food/meal/entry note.
 *
 * Text runs go through {@link MarkdownMessage}; embedded photos are rendered as
 * ordinary RN images between them rather than as markdown image nodes. See
 * `splitNoteSegments` for why — in short, the native renderer never re-measures
 * after an image downloads (so later content gets clipped) and cannot send the
 * proxy-auth headers some servers need.
 *
 * Chat keeps using `MarkdownMessage` directly: its markdown comes from the
 * assistant, not another user, and has no uploads to resolve.
 */
export function NoteMarkdown({
  text,
  fontSize = 14,
  color,
  images,
}: NoteMarkdownProps) {
  const { t } = useTranslation();
  const getImageSource = useFoodImageSourceContext();

  const segments = useMemo(
    () => splitNoteSegments(text, images ?? []),
    [text, images]
  );

  if (segments.length === 0) return null;

  return (
    <View className="gap-1">
      {segments.map((segment, index) => {
        if (segment.kind === 'text') {
          return (
            <MarkdownMessage
              key={`text-${index}`}
              text={segment.value}
              streaming={false}
              fontSize={fontSize}
              color={color}
            />
          );
        }

        const source = getImageSource(segment.path);
        if (!source) {
          return (
            <Text
              key={`missing-${index}`}
              className="text-sm italic text-text-muted"
            >
              {segment.alt.trim() ||
                t('notes.photoUnavailable', {
                  defaultValue: 'Photo unavailable',
                })}
            </Text>
          );
        }

        return (
          <View key={`image-${index}`} className="my-1">
            <SafeImage
              source={source}
              style={{ width: '100%', height: 220, borderRadius: 8 }}
              contentFit="cover"
            />
          </View>
        );
      })}
    </View>
  );
}
