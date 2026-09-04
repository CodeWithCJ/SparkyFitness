/**
 * The text transforms behind a markdown notes toolbar.
 *
 * Pure string arithmetic over a value and a selection range — no DOM, no React
 * Native types — so the web editor and the mobile notes field drive their
 * toolbars from one implementation. Each platform passes the text and the
 * selection start/end, then applies the returned text and selection back to its
 * own input.
 *
 * Only the actions are shared. The button lists stay per-platform because the
 * icons and layout differ; both build theirs from `NOTE_TOOLBAR_ACTIONS`.
 */

/**
 * How a toolbar button changes the text.
 *
 * `wrap` surrounds the selection (bold, code); `linePrefix` prefixes every
 * selected line (lists); `block` inserts a multi-line construct on its own
 * line. `placeholder`/`select` is what gets inserted and selected when the user
 * clicks with nothing selected, so a button is still useful from an empty caret.
 */
export type ToolbarAction =
  | { kind: "wrap"; before: string; after: string; placeholder: string }
  | { kind: "linePrefix"; prefix: string | ((index: number) => string) }
  | { kind: "block"; snippet: string; select?: string };

export interface ToolbarApplyResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * The markdown each shared toolbar button produces.
 *
 * Keyed so a platform can pick the subset it shows and attach its own icon and
 * translation key, while the markdown written stays identical everywhere.
 */
export const NOTE_TOOLBAR_ACTIONS = {
  bold: {
    kind: "wrap",
    before: "**",
    after: "**",
    placeholder: "bold",
  },
  italic: { kind: "wrap", before: "_", after: "_", placeholder: "italic" },
  strikethrough: {
    kind: "wrap",
    before: "~~",
    after: "~~",
    placeholder: "text",
  },
  code: { kind: "wrap", before: "`", after: "`", placeholder: "code" },
  link: { kind: "wrap", before: "[", after: "](url)", placeholder: "text" },
  heading: { kind: "linePrefix", prefix: "## " },
  quote: { kind: "linePrefix", prefix: "> " },
  bulletList: { kind: "linePrefix", prefix: "- " },
  numberedList: {
    kind: "linePrefix",
    prefix: (index: number) => `${index + 1}. `,
  },
  taskList: { kind: "linePrefix", prefix: "- [ ] " },
  table: {
    kind: "block",
    snippet:
      "| Item | Amount |\n| --- | --- |\n| Ingredient | 1 cup |\n| Ingredient | 2 tbsp |\n",
    select: "Item",
  },
} as const satisfies Record<string, ToolbarAction>;

export type NoteToolbarActionId = keyof typeof NOTE_TOOLBAR_ACTIONS;

/**
 * Applies one toolbar button to the text.
 *
 * Pure, so the selection arithmetic is testable without an input of any kind.
 */
export function applyToolbarAction(
  action: ToolbarAction,
  text: string,
  selectionStart: number,
  selectionEnd: number,
): ToolbarApplyResult {
  if (action.kind === "wrap") {
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

  if (action.kind === "block") {
    // Open a new line unless the caret already sits at the start of one, so a
    // table never gets glued onto the end of a sentence.
    const before = text.slice(0, selectionStart);
    const needsLeadingBreak = before.length > 0 && !before.endsWith("\n");
    const prefix = needsLeadingBreak ? "\n" : "";
    const inserted = `${prefix}${action.snippet}`;
    const offset = action.select
      ? selectionStart + inserted.indexOf(action.select)
      : selectionStart + inserted.length;
    return {
      text: before + inserted + text.slice(selectionEnd),
      selectionStart: offset,
      selectionEnd: action.select ? offset + action.select.length : offset,
    };
  }

  // Expand the selection to whole lines: a list marker belongs at line start,
  // not wherever the user happened to click.
  const lineStart = text.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEndIndex = text.indexOf("\n", selectionEnd);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;

  const block = text.slice(lineStart, lineEnd);
  const prefixed = block
    .split("\n")
    .map((line, index) =>
      typeof action.prefix === "string"
        ? `${action.prefix}${line}`
        : `${action.prefix(index)}${line}`,
    )
    .join("\n");

  return {
    text: text.slice(0, lineStart) + prefixed + text.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + prefixed.length,
  };
}

/** Markdown for embedding one of the entity's photos, referenced by file name. */
export function noteImageSnippet(alt: string, fileName: string): ToolbarAction {
  return { kind: "block", snippet: `![${alt}](${fileName})\n`, select: alt };
}
