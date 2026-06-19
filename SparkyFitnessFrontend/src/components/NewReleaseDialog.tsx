import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

export interface ReleaseInfo {
  version: string;
  releaseNotes: string;
  publishedAt: string;
  htmlUrl: string;
  isNewVersionAvailable: boolean;
}

interface NewReleaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  releaseInfo: ReleaseInfo | null;
  onDismissForVersion: (version: string) => void;
}

const formatGithubReleaseNotes = (notes: string): string => {
  if (!notes) return '';

  let formatted = notes;

  // 1. Convert GitHub pull request URLs to [#PR_NUMBER](URL)
  formatted = formatted.replace(
    /https:\/\/github\.com\/CodeWithCJ\/SparkyFitness\/pull\/(\d+)/g,
    '[#$1](https://github.com/CodeWithCJ/SparkyFitness/pull/$1)'
  );

  // 2. Convert GitHub commit URLs to [commit_hash](URL)
  formatted = formatted.replace(
    /https:\/\/github\.com\/CodeWithCJ\/SparkyFitness\/commit\/([a-f0-9]{7,40})/g,
    (match, hash) => `[\`${hash.slice(0, 7)}\`](${match})`
  );

  // 3. Convert @username mentions to [@username](https://github.com/username)
  // Avoid matching email addresses by requiring @ to be preceded by non-alphanumeric/start
  formatted = formatted.replace(
    /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9-]+)/g,
    '$1[@$2](https://github.com/$2)'
  );

  return formatted;
};

const NewReleaseDialog: React.FC<NewReleaseDialogProps> = ({
  isOpen,
  onClose,
  releaseInfo,
  onDismissForVersion,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [hasReadFully, setHasReadFully] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');

  const hasBreakingChange =
    releaseInfo?.releaseNotes?.toLowerCase().includes('breaking change') ??
    false;

  const isConfirmedText =
    !hasBreakingChange || confirmationText.trim().toUpperCase() === 'BREAKING';

  const canClose = hasReadFully && hasAcknowledged && isConfirmedText;

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Check if user scrolled to bottom (with 5px margin of error)
    const isAtBottom =
      container.scrollHeight - container.scrollTop <=
      container.clientHeight + 5;

    if (isAtBottom) {
      setHasReadFully(true);
    }
  };

  useEffect(() => {
    if (isOpen && releaseInfo) {
      setHasReadFully(false);
      setHasAcknowledged(false);
      setConfirmationText('');

      // Check if container has no scrollbar (content is short)
      const timer = setTimeout(() => {
        const container = scrollContainerRef.current;
        if (container) {
          if (container.scrollHeight <= container.clientHeight) {
            setHasReadFully(true);
          }
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isOpen, releaseInfo]);

  useEffect(() => {
    if (isOpen) {
      const handleMouseDown = (event: MouseEvent) => {
        if (!canClose) return; // Block closing if not read/acknowledged
        if (
          contentRef.current &&
          !contentRef.current.contains(event.target as Node)
        ) {
          onClose();
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && canClose) {
          onClose();
        }
      };

      document.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose, canClose]);

  if (!isOpen || !releaseInfo) {
    return null;
  }

  const handleDismiss = () => {
    if (canClose && releaseInfo) {
      onDismissForVersion(releaseInfo.version);
      onClose();
    }
  };

  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (canClose) {
        handleDismiss();
      }
    }
  };

  const handleOpenChange = (open: boolean) => {
    // Prevent closing via overlay click or ESC unless requirements are met
    if (!open && !canClose) {
      return;
    }
    if (!open) {
      onClose();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        ref={contentRef}
        className="max-w-2xl max-h-[85vh] flex flex-col p-6 overflow-hidden"
      >
        {hasBreakingChange && (
          <div className="bg-red-500 text-white font-bold p-3 text-center text-xs flex items-center justify-center gap-2 rounded-t-lg -mx-6 -mt-6 mb-4 animate-pulse">
            <AlertTriangle className="h-4 w-4 animate-bounce" />
            <span>
              CRITICAL WARNING: THIS RELEASE CONTAINS BREAKING CHANGES!
            </span>
          </div>
        )}
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-bold">
            New Version Available: {releaseInfo.version}
          </AlertDialogTitle>
          <AlertDialogDescription className="flex flex-col gap-2 mt-2">
            <p>A new version of SparkyFitness is available!</p>
            <p className="text-xs text-muted-foreground">
              Published:{' '}
              {new Date(releaseInfo.publishedAt).toLocaleDateString()}
            </p>

            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="mt-3 p-3 border border-border rounded-md max-h-64 overflow-y-auto bg-muted/30"
            >
              <h3 className="font-semibold mb-2 text-sm text-foreground">
                Release Notes:
              </h3>
              <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-foreground leading-relaxed">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ ...props }) => (
                      <h1
                        className="text-base font-bold mt-3 mb-2 border-b pb-1 text-foreground"
                        {...props}
                      />
                    ),
                    h2: ({ ...props }) => (
                      <h2
                        className="text-sm font-semibold mt-2 mb-1 text-foreground"
                        {...props}
                      />
                    ),
                    h3: ({ ...props }) => (
                      <h3
                        className="text-xs font-semibold mt-2 mb-1 text-foreground"
                        {...props}
                      />
                    ),
                    p: ({ ...props }) => (
                      <p className="mb-2 whitespace-pre-wrap" {...props} />
                    ),
                    ul: ({ ...props }) => (
                      <ul
                        className="list-disc pl-4 mb-2 space-y-1"
                        {...props}
                      />
                    ),
                    ol: ({ ...props }) => (
                      <ol
                        className="list-decimal pl-4 mb-2 space-y-1"
                        {...props}
                      />
                    ),
                    li: ({ ...props }) => (
                      <li className="mb-0.5 whitespace-pre-wrap" {...props} />
                    ),
                    code: ({ ...props }) => (
                      <code
                        className="bg-muted px-1 py-0.5 rounded font-mono text-[11px]"
                        {...props}
                      />
                    ),
                    pre: ({ ...props }) => (
                      <pre
                        className="bg-muted p-2 rounded overflow-x-auto my-2 font-mono text-[11px] border"
                        {...props}
                      />
                    ),
                    blockquote: ({ ...props }) => (
                      <blockquote
                        className="border-l-2 border-muted-foreground/30 pl-3 italic my-2 text-muted-foreground"
                        {...props}
                      />
                    ),
                    a: ({ href, children, ...props }) => {
                      const isPrLink = href?.startsWith(
                        'https://github.com/CodeWithCJ/SparkyFitness/pull/'
                      );
                      const isUserLink =
                        href?.startsWith('https://github.com/') &&
                        !href.includes('/', 19);

                      if (isUserLink) {
                        return (
                          <a
                            href={href}
                            className="bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-300 font-semibold px-1 py-0.5 rounded hover:underline text-[11px]"
                            target="_blank"
                            rel="noopener noreferrer"
                            {...props}
                          >
                            {children}
                          </a>
                        );
                      }

                      return (
                        <a
                          href={href}
                          className={cn(
                            'text-blue-500 hover:underline font-medium',
                            isPrLink &&
                              'font-semibold text-blue-600 dark:text-blue-400'
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          {...props}
                        >
                          {children}
                        </a>
                      );
                    },
                  }}
                >
                  {formatGithubReleaseNotes(releaseInfo.releaseNotes)}
                </ReactMarkdown>
              </div>
            </div>

            {!hasReadFully && (
              <p className="text-xs text-yellow-600 dark:text-yellow-500 font-medium animate-pulse mt-1">
                ⚠️ Please scroll to the bottom of the release notes to finish
                reading.
              </p>
            )}

            {hasReadFully && (
              <div
                className={cn(
                  'mt-4 flex items-start space-x-3 border rounded-md p-3 transition-colors',
                  hasBreakingChange
                    ? 'border-red-200 dark:border-red-950/50 bg-red-50 dark:bg-red-950/10'
                    : 'border-border bg-muted/20'
                )}
              >
                <Checkbox
                  id="read-acknowledgement-chk"
                  checked={hasAcknowledged}
                  onCheckedChange={(checked) =>
                    setHasAcknowledged(checked === true)
                  }
                  className={cn(
                    'mt-0.5',
                    hasBreakingChange &&
                      'border-red-500 data-[state=checked]:bg-red-500 data-[state=checked]:text-white'
                  )}
                />
                <div className="grid gap-1 w-full">
                  <label
                    htmlFor="read-acknowledgement-chk"
                    className={cn(
                      'text-xs font-semibold leading-none cursor-pointer',
                      hasBreakingChange
                        ? 'text-red-800 dark:text-red-300'
                        : 'text-foreground'
                    )}
                  >
                    {hasBreakingChange ? (
                      <>
                        I acknowledge that this release contains a{' '}
                        <span className="underline decoration-wavy decoration-red-500">
                          BREAKING CHANGE
                        </span>{' '}
                        and I have read the changes.
                      </>
                    ) : (
                      'I have read and understood the release notes.'
                    )}
                  </label>
                  <p
                    className={cn(
                      'text-xs leading-normal',
                      hasBreakingChange
                        ? 'text-red-700/80 dark:text-red-400/80 font-medium'
                        : 'text-muted-foreground'
                    )}
                  >
                    {hasBreakingChange
                      ? 'Please contact the platform administrator to coordinate updates before proceeding.'
                      : 'Checking this box confirms you are up-to-date with the latest changes.'}
                  </p>

                  {hasBreakingChange && (
                    <div className="flex flex-col gap-1.5 mt-3">
                      <label
                        htmlFor="confirm-text-input"
                        className="text-xs font-semibold text-red-800 dark:text-red-300"
                      >
                        To confirm you understand, please type{' '}
                        <strong className="font-mono text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/40 px-1 py-0.5 rounded border border-red-200 dark:border-red-900/40">
                          BREAKING
                        </strong>{' '}
                        below:
                      </label>
                      <Input
                        id="confirm-text-input"
                        type="text"
                        value={confirmationText}
                        onChange={(e) => setConfirmationText(e.target.value)}
                        onKeyDown={handleKeyDownInput}
                        placeholder="Type 'BREAKING' here"
                        className="max-w-xs border-red-300 dark:border-red-900 focus-visible:ring-red-500 h-8 text-xs bg-background text-foreground"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <p className="mt-4 text-xs">
              View on GitHub:{' '}
              <a
                href={releaseInfo.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                {releaseInfo.htmlUrl}
              </a>
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 sm:justify-center">
          <AlertDialogCancel
            onClick={handleDismiss}
            disabled={!canClose}
            className="w-full sm:w-auto"
          >
            Don't show again for this version
          </AlertDialogCancel>
        </AlertDialogFooter>
        <AlertDialogCancel
          onClick={onClose}
          disabled={!canClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground p-0"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </AlertDialogCancel>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default NewReleaseDialog;
