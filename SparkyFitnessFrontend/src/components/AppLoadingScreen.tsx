import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AppLoadingScreenProps {
  messageKey?: string;
}

export const AppLoadingScreen = ({
  messageKey = 'common.loadingPage',
}: AppLoadingScreenProps) => {
  const { t } = useTranslation();
  const message = t(messageKey);

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-6"
      role="status"
      aria-label={message}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="rounded-full bg-primary/10 p-3 text-primary">
          <LoaderCircle
            className="h-7 w-7 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        </span>
        <p className="text-sm font-medium text-muted-foreground">{message}</p>
      </div>
    </div>
  );
};
