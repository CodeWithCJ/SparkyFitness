import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** A failed read, said as such (never as "nothing there"), with a retry. */
const LoadError = ({
  message,
  onRetry,
  compact = false,
}: {
  message: string;
  onRetry: () => void;
  /** One line, for a list row. */
  compact?: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <span
      role="alert"
      className={
        compact
          ? 'flex items-center gap-2 text-destructive'
          : 'flex flex-wrap items-center gap-2 text-sm text-destructive'
      }
    >
      {message}
      <Button
        variant="outline"
        size="sm"
        className={compact ? 'h-7 px-2' : undefined}
        onClick={onRetry}
      >
        {t('challenges.retry', 'Try again')}
      </Button>
    </span>
  );
};

export default LoadError;
