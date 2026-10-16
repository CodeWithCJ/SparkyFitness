import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { error } from '@/utils/logging';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTranslation } from 'react-i18next';
const NotFound: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { loggingLevel } = usePreferences();

  useEffect(() => {
    error(
      loggingLevel,
      '404 Error: User attempted to access non-existent route:',
      location.pathname
    );
  }, [location.pathname, loggingLevel]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
      <div className="max-w-md">
        <h1 className="text-6xl font-bold mb-4 text-foreground">404</h1>
        <p className="text-xl text-muted-foreground mb-8">
          {t(
            'errors.notFound.oopsPageNotFoundOr',
            'Oops! Page not found or an unexpected error occurred.'
          )}
        </p>
        <Button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 mx-auto"
        >
          <Home className="h-4 w-4" />
          {t('errors.notFound.returnToHome', 'Return to Home')}
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
