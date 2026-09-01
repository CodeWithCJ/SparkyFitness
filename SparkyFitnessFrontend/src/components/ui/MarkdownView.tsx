import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ImageOff } from 'lucide-react';
import { resolveNoteImage } from '@workspace/shared';

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

/**
 * Whether a markdown image may actually be loaded.
 *
 * Only this app's own uploads are embeddable. react-markdown's default
 * `urlTransform` already blanks `javascript:` and `data:`, but it permits any
 * http(s) host — and a note on a shared food or meal is fetched by every person
 * the library is shared with. An arbitrary remote `![](…)` would therefore be a
 * tracking pixel that reports each viewer's IP and user-agent to a third party,
 * so cross-origin sources are rendered as an inert chip instead of loaded.
 *
 * Note this is intentionally stricter than `resolveFoodImageSrc`, which passes
 * absolute URLs through so provider thumbnails can be hotlinked in search
 * results. That is a first-party choice about a known provider; this is
 * arbitrary text a user typed.
 */
export function embeddableImageSrc(
  src: string | undefined,
  candidates: readonly string[] = []
): string | null {
  if (!src) return null;
  // A note references a photo by file name; resolving it against the owning
  // entity's own images is what keeps a note from pointing anywhere else.
  const matched = resolveNoteImage(src, candidates);
  if (matched) return matched;
  // Notes written before short references stored the whole path. Keep those
  // working, but only when they address this app's uploads.
  const trimmed = src.trim();
  if (trimmed.startsWith('/uploads/')) return trimmed;
  return null;
}

/** Host shown in the placeholder chip, when the blocked src parses as a URL. */
function blockedImageLabel(src: string | undefined): string | null {
  if (!src) return null;
  try {
    return new URL(src, window.location.origin).host || null;
  } catch {
    return null;
  }
}
const buildMarkdownComponents = (images: readonly string[]): Components => ({
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
  del: ({ ...props }) => (
    <del className="line-through text-muted-foreground" {...props} />
  ),
  hr: ({ ...props }) => <hr className="my-3 border-muted" {...props} />,
  // GFM renders task-list items as a disabled checkbox. Style it as a marker
  // rather than a control, so it does not invite a click that cannot work:
  // ticking one would need per-note checkbox state, which notes do not have.
  input: ({ type, checked, ...props }) =>
    type === 'checkbox' ? (
      <span
        aria-hidden="true"
        className={cn(
          'inline-block w-3 h-3 mr-1.5 -mb-px rounded-[3px] border align-middle',
          checked
            ? 'bg-muted-foreground/60 border-muted-foreground/60'
            : 'border-muted-foreground/40'
        )}
      />
    ) : (
      <input type={type} {...props} />
    ),
  img: ({ src, alt, ...props }) => {
    const safeSrc = embeddableImageSrc(
      typeof src === 'string' ? src : undefined,
      images
    );
    if (safeSrc) {
      return (
        <img
          src={safeSrc}
          alt={alt ?? ''}
          loading="lazy"
          className="my-2 max-h-64 rounded-md border object-contain"
          {...props}
        />
      );
    }
    const host = blockedImageLabel(typeof src === 'string' ? src : undefined);
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5 my-1 text-xs text-muted-foreground align-middle"
        title={
          host ? `External image blocked: ${host}` : 'External image blocked'
        }
      >
        <ImageOff className="h-3 w-3" aria-hidden="true" />
        {alt?.trim() ? alt : host ? `image from ${host}` : 'external image'}
      </span>
    );
  },
});

interface MarkdownViewProps {
  children: string;
  className?: string;
  /**
   * Stored image paths this note may embed — the owning food's or meal's
   * photos, plus a diary entry's own overrides. A reference that matches none
   * of them renders as a placeholder rather than loading anything.
   */
  images?: readonly string[];
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  children,
  className,
  images,
}) => {
  const components = React.useMemo(
    () => buildMarkdownComponents(images ?? []),
    [images]
  );
  return (
    <div className={cn('text-sm text-foreground leading-relaxed', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownView;
