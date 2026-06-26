import React, { useMemo } from 'react';
import { Linking } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  EnrichedMarkdownText,
  type MarkdownStyle,
  type LinkPressEvent,
} from 'react-native-enriched-markdown';
import remend from 'remend';
import { addLog } from '../../services/LogService';

/**
 * Renders an assistant chat message as themed markdown.
 *
 * `react-native-enriched-markdown` is a native md4c renderer. Its built-in
 * `markdownStyle` defaults are light-mode colors that would be invisible on the
 * dark/AMOLED themes, so we override every text-bearing element's color from
 * theme CSS vars (the native side merges per-element, keeping its default sizes
 * and margins). LaTeX math is disabled via `md4cFlags` so prebuild doesn't pull
 * in the optional native math libs.
 *
 * While the model streams, it emits partial markdown (an unclosed `**`, a
 * half-typed link). We repair the tail on the JS thread with `remend` before
 * rendering — cheap for chat-sized text — and let the native `streamingAnimation`
 * fade in newly appended characters.
 */

const MD4C_FLAGS = { latexMath: false } as const;
// Math is off, so don't let remend complete `$$…$$` (it would only render as
// literal dollar signs). `text-only` shows a half-streamed link as plain text
// instead of a tappable placeholder URL.
const REMEND_OPTIONS = { katex: false, linkMode: 'text-only' } as const;

function openLink({ url }: LinkPressEvent) {
  Linking.openURL(url).catch((error) => {
    addLog('Failed to open chat link', 'WARNING', [url, String(error)]);
  });
}

export default function MarkdownMessage({
  text,
  color,
  fontSize,
  streaming = true,
}: {
  text: string;
  /** Body text color. Defaults to the theme's primary text color. */
  color?: string;
  /** Paragraph font size. Defaults to the renderer's built-in 16px. */
  fontSize?: number;
  /** Fade in appended characters. Leave off for already-complete text. */
  streaming?: boolean;
}) {
  const [textPrimary, muted, accent, raised, background, border] = useCSSVariable([
    '--color-text-primary',
    '--color-text-muted',
    '--color-accent-primary',
    '--color-raised',
    '--color-background',
    '--color-border-subtle',
  ]) as [string, string, string, string, string, string];

  const body = color ?? textPrimary;

  const markdownStyle = useMemo<MarkdownStyle>(
    () => ({
      // Only set fontSize when overridden — passing `undefined` would clobber
      // the renderer's default 16px (its per-element merge is a plain spread).
      paragraph: fontSize
        ? { color: body, fontSize, lineHeight: Math.round(fontSize * 1.4) }
        : { color: body },
      h1: { color: body },
      h2: { color: body },
      h3: { color: body },
      h4: { color: body },
      h5: { color: body },
      h6: { color: body },
      strong: { color: body },
      em: { color: body },
      list: { color: body, markerColor: body, bulletColor: body },
      blockquote: { color: muted, borderColor: border },
      link: { color: accent, underline: true },
      code: { color: body, backgroundColor: raised },
      codeBlock: { color: body, backgroundColor: background, borderColor: border },
      thematicBreak: { color: border },
    }),
    [body, muted, accent, raised, background, border, fontSize]
  );

  const markdown = useMemo(() => remend(text, REMEND_OPTIONS), [text]);

  return (
    <EnrichedMarkdownText
      markdown={markdown}
      markdownStyle={markdownStyle}
      md4cFlags={MD4C_FLAGS}
      streamingAnimation={streaming}
      onLinkPress={openLink}
    />
  );
}
