import type React from 'react';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface NewReleaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  releaseInfo: {
    version: string;
    releaseNotes: string;
    publishedAt: string;
    htmlUrl: string;
    isNewVersionAvailable: boolean;
  } | null;
  onDismissForVersion: (version: string) => void;
}

const NewReleaseDialog: React.FC<NewReleaseDialogProps> = ({
  isOpen,
  onClose,
  releaseInfo,
  onDismissForVersion,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const handleMouseDown = (event: MouseEvent) => {
        if (contentRef.current && !contentRef.current.contains(event.target as Node)) {
          onClose();
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
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
  }, [isOpen, onClose]);

  if (!releaseInfo || !releaseInfo.isNewVersionAvailable) {
    return null;
  }

  const handleDismiss = () => {
    if (releaseInfo) {
      onDismissForVersion(releaseInfo.version);
    }
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent ref={contentRef} className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>New Version Available: {releaseInfo.version}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <p>A new version of SparkyFitness is available!</p>
              <p>Published: {new Date(releaseInfo.publishedAt).toLocaleDateString()}</p>
              <div className="mt-4 p-2 border rounded max-h-60 overflow-y-auto">
                <h3 className="font-semibold mb-2">Release Notes:</h3>
                <p className="whitespace-pre-wrap">{releaseInfo.releaseNotes}</p>
              </div>
              <p className="mt-4">
                View on GitHub:{' '}
                <a href={releaseInfo.htmlUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                  {releaseInfo.htmlUrl}
                </a>
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center">
          <AlertDialogCancel onClick={handleDismiss}>Don't show again for this version</AlertDialogCancel>
        </AlertDialogFooter>
        <AlertDialogCancel onClick={onClose} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground p-0">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </AlertDialogCancel>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default NewReleaseDialog;