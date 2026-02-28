import {
  isRouteErrorResponse,
  useRouteError,
  useNavigate,
} from 'react-router-dom';
import { Home, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const RootErrorBoundary = () => {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = 'Unknown Error';
  let message = 'An unexpected error occurred.';

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = String(error.data);
  } else if (error instanceof Error) {
    title = 'Error';
    message = error.message;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
      <div className="max-w-md">
        <h1 className="text-4xl font-bold mb-4 text-foreground">{title}</h1>
        <p className="text-xl text-muted-foreground mb-8">{message}</p>
        <Button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 mx-auto"
        >
          <Home className="h-4 w-4" />
          Return to Home
        </Button>
      </div>
    </div>
  );
};

export const RouteErrorBoundary = () => {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = 'Something went wrong';
  let message = 'We are having trouble loading this section.';

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = String(error.data);
  } else if (error instanceof Error) {
    title = 'Error';
    message = error.message;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] bg-background p-6 text-center rounded-lg border border-border mt-4">
      <div className="max-w-md">
        <h2 className="text-2xl font-bold mb-3 text-foreground">{title}</h2>
        <p className="text-muted-foreground mb-6">{message}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            Reload Page
          </Button>
          <Button
            onClick={() => navigate('/')}
            className="flex items-center gap-2"
          >
            <Home className="h-4 w-4" />
            Return to Home
          </Button>
        </div>
      </div>
    </div>
  );
};
