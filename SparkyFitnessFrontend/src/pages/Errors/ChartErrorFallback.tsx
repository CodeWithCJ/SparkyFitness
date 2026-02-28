import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from 'react-error-boundary';
interface FallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}
const ChartErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center border border-dashed rounded-lg bg-muted/10 border-border">
      <AlertCircle className="w-10 h-10 mb-4 text-muted-foreground" />
      <h3 className="text-lg font-medium text-foreground">
        Failed to load component
      </h3>
      <p className="max-w-sm mt-2 mb-6 text-sm text-muted-foreground">
        {error.message}
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={resetErrorBoundary}
        className="flex items-center gap-2"
      >
        <RefreshCcw className="w-4 h-4" />
        Try Again
      </Button>
    </div>
  );
};

export const ChartErrorBoundary = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <ErrorBoundary FallbackComponent={ChartErrorFallback}>
    {children}
  </ErrorBoundary>
);
