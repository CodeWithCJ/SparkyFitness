import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  articlesForMode,
  articleBySlug,
  type CycleArticle,
  type CycleMode,
} from '@workspace/shared';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BookOpen, Clock, ChevronRight } from 'lucide-react';

/** Minimal, safe markdown renderer for our own curated article bodies. */
function renderMarkdown(md: string) {
  const lines = md.split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flushList = (key: number) => {
    if (list.length) {
      out.push(
        <ul key={`ul-${key}`} className="my-2 list-disc space-y-1 pl-5 text-sm">
          {list.map((li, i) => (
            <li key={i}>{renderInline(li)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      flushList(i);
      out.push(
        <h3 key={i} className="mt-4 mb-1 text-base font-semibold">
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith('- ')) {
      list.push(line.slice(2));
    } else if (line.startsWith('*') && line.endsWith('*') && line.length > 2) {
      flushList(i);
      out.push(
        <p key={i} className="my-2 text-xs italic text-muted-foreground">
          {line.replace(/^\*|\*$/g, '')}
        </p>
      );
    } else if (line) {
      flushList(i);
      out.push(
        <p key={i} className="my-2 text-sm leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
  });
  flushList(lines.length);
  return out;
}

function renderInline(text: string): React.ReactNode {
  // Bold **x** only.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

interface ArticleLibraryProps {
  mode: CycleMode;
}

export default function ArticleLibrary({ mode }: ArticleLibraryProps) {
  const { t } = useTranslation();
  const articles = articlesForMode(mode);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const open: CycleArticle | null = openSlug ? articleBySlug(openSlug) : null;

  return (
    <>
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <BookOpen className="h-4 w-4" />
          {t('cycle.care.library', 'Health library')}
        </p>
        {articles.map((a) => (
          <Card
            key={a.slug}
            className="cursor-pointer transition hover:bg-muted/30"
            onClick={() => setOpenSlug(a.slug)}
          >
            <CardContent className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{a.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.summary}
                </p>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" /> {a.minutes} min
                </span>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenSlug(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle>{open.title}</DialogTitle>
              </DialogHeader>
              <div>{renderMarkdown(open.body)}</div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
