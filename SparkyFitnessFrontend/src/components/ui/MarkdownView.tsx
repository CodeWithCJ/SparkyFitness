import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

/**
 * Renders user-authored markdown.
 *
 * Deliberately does NOT enable `rehype-raw`: react-markdown ignores raw HTML by
 * default, which is what keeps a pasted `<script>` or `<img onerror>` inert.
 * This text comes from users and, for a shared food or meal, is read by other
 * people — do not add raw-HTML support to it.
 *
 * The element map exists because this project has no `@tailwindcss/typography`
 * plugin, so bare `prose` classes style nothing.
 */
const markdownComponents: Components = {
  h1: ({ ...props }) => (
    <h1
      className="text-base font-bold mt-3 mb-2 first:mt-0 text-foreground"
      {...props}
    />
  ),
  h2: ({ ...props }) => (
    <h2
      className="text-sm font-semibold mt-3 mb-1 first:mt-0 text-foreground"
      {...props}
    />
  ),
  h3: ({ ...props }) => (
    <h3
      className="text-sm font-semibold mt-2 mb-1 first:mt-0 text-foreground"
      {...props}
    />
  ),
  p: ({ ...props }) => (
    <p className="mb-2 last:mb-0 whitespace-pre-wrap" {...props} />
  ),
  ul: ({ ...props }) => (
    <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-1" {...props} />
  ),
  ol: ({ ...props }) => (
    <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-1" {...props} />
  ),
  li: ({ ...props }) => (
    <li className="mb-0.5 whitespace-pre-wrap" {...props} />
  ),
  code: ({ ...props }) => (
    <code
      className="bg-muted px-1 py-0.5 rounded font-mono text-[0.85em]"
      {...props}
    />
  ),
  pre: ({ ...props }) => (
    <pre
      className="bg-muted p-2 rounded overflow-x-auto my-2 font-mono text-xs border"
      {...props}
    />
  ),
  blockquote: ({ ...props }) => (
    <blockquote
      className="border-l-2 border-muted-foreground/30 pl-3 italic my-2 text-muted-foreground"
      {...props}
    />
  ),
  table: ({ ...props }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-left border-collapse" {...props} />
    </div>
  ),
  th: ({ ...props }) => (
    <th className="border-b px-2 py-1 font-semibold" {...props} />
  ),
  td: ({ ...props }) => <td className="border-b px-2 py-1" {...props} />,
  a: ({ href, children, ...props }) => (
    <a
      href={href}
      className="text-blue-500 hover:underline font-medium"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
};

interface MarkdownViewProps {
  children: string;
  className?: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  children,
  className,
}) => (
  <div className={cn('text-sm text-foreground leading-relaxed', className)}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {children}
    </ReactMarkdown>
  </div>
);

export default MarkdownView;
