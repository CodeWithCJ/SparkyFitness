interface CallbackStatusProps {
  loading: boolean;
  message: string;
}
export const CallbackStatus = ({ loading, message }: CallbackStatusProps) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-transparent">
      <div className="p-8 bg-card rounded-xl shadow-lg border text-center max-w-md w-full">
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-6"></div>
            <p className="text-xl font-medium text-foreground">{message}</p>
            <p className="text-muted-foreground mt-2 text-sm">
              This will only take a moment.
            </p>
          </>
        ) : (
          <div className="text-center">
            <div className="h-12 w-12 bg-green-100 dark:bg-green-900/30 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <p className="text-xl font-medium text-foreground mb-2">
              {message}
            </p>
            <p className="text-muted-foreground text-sm">
              Redirecting you back to settings...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
