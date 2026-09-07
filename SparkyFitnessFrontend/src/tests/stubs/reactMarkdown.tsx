import React from 'react';

/**
 * Stub for `react-markdown`, wired in through `moduleNameMapper`.
 *
 * It is ESM-only and jest transforms nothing under `node_modules`, so any
 * suite that transitively reaches `src/components/ui/MarkdownView.tsx` — which
 * now includes the food logging dialog, the food-entry editor, and meal
 * management — dies with "Unexpected token 'export'" before a single test runs.
 *
 * The stub renders the markdown source as plain text, which is what the suites
 * using it actually assert: that a note reaches the screen at all. A test that
 * needs real markdown-to-HTML behaviour should cover `MarkdownView` in a
 * browser-level test rather than loosening this.
 */
const ReactMarkdown = ({
  children,
}: {
  children?: React.ReactNode;
  [key: string]: unknown;
}) => <div data-testid="markdown">{children}</div>;

export default ReactMarkdown;
