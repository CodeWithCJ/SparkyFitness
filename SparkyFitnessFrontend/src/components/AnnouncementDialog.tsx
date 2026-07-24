import type React from 'react';
import { X, Megaphone } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

export interface AnnouncementInfo {
  id: string;
  active: boolean;
  title: string;
  message: string;
  publishedAt?: string;
  htmlUrl?: string;
}

interface AnnouncementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  announcement: AnnouncementInfo | null;
  onDismiss: (id: string) => void;
}

const AnnouncementDialog: React.FC<AnnouncementDialogProps> = ({
  isOpen,
  onClose,
  announcement,
  onDismiss,
}) => {
  if (!announcement || !announcement.active) return null;

  const handleDismiss = () => {
    onDismiss(announcement.id);
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-xl border border-primary/20 bg-background text-foreground shadow-2xl">
        <AlertDialogHeader className="px-6 pt-6 pb-4 border-b border-border/40 flex-row items-center justify-between space-y-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <AlertDialogTitle className="text-xl font-bold tracking-tight">
                {announcement.title || 'Announcement'}
              </AlertDialogTitle>
              {announcement.publishedAt && (
                <AlertDialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Published:{' '}
                  {new Date(announcement.publishedAt).toLocaleDateString(
                    undefined,
                    {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    }
                  )}
                </AlertDialogDescription>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </AlertDialogHeader>

        <div className="px-6 py-4 overflow-y-auto flex-1 text-sm leading-relaxed prose prose-slate dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {announcement.message}
          </ReactMarkdown>
        </div>

        <AlertDialogFooter className="px-6 py-4 border-t border-border/40 flex items-center justify-end space-x-3 bg-muted/20">
          <AlertDialogCancel
            onClick={handleDismiss}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2 font-medium rounded-lg text-sm transition-colors"
          >
            Got it, don&apos;t show again
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default AnnouncementDialog;
