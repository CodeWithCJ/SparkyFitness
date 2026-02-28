import type React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useState, useEffect, lazy, Suspense } from 'react';
import {
  PreferencesProvider,
  usePreferences,
} from '@/contexts/PreferencesContext';
import { ChatbotVisibilityProvider } from '@/contexts/ChatbotVisibilityContext';
import LanguageHandler from '@/components/LanguageHandler';
import { WaterContainerProvider } from '@/contexts/WaterContainerContext';
import {
  ActiveUserProvider,
  useActiveUser,
} from '@/contexts/ActiveUserContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import DraggableChatbotButton from '@/components/DraggableChatbotButton';
import AboutDialog from '@/components/AboutDialog';
import NewReleaseDialog from '@/components/NewReleaseDialog';
import AppSetup from '@/components/AppSetup';
import { Toaster } from '@/components/ui/toaster';
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  useNavigate,
  Navigate,
  useOutletContext,
} from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import OidcCallback from '@/components/OidcCallback';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useCurrentVersionQuery } from './hooks/useGeneralQueries';
import {
  RootErrorBoundary,
  RouteErrorBoundary,
} from './pages/Errors/ErrorComponents';
import { error as logError } from '@/utils/logging';
import { getUserLoggingLevel } from '@/utils/userPreferences.ts';
const Auth = lazy(() => import('@/pages/Auth/Auth'));
const ForgotPassword = lazy(() => import('@/pages/Auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/Auth/ResetPassword'));
const Index = lazy(() => import('@/pages/Index'));
const Diary = lazy(() => import('@/pages/Diary/Diary'));
const CheckIn = lazy(() => import('./pages/CheckIn/CheckIn'));
const FoodDatabaseManager = lazy(() => import('./pages/Foods/Foods'));
const Reports = lazy(() => import('./pages/Reports/Reports'));
const ExerciseDatabaseManager = lazy(
  () => import('./pages/Exercises/Exercises')
);
const GoalsSettings = lazy(() => import('./pages/Goals/Goals'));
const Settings = lazy(() => import('./pages/Settings/SettingsPage'));
const AdminPage = lazy(() => import('./pages/Admin/Admin'));
const UserManagement = lazy(() => import('@/pages/Admin/UserManagement'));
const AuthenticationSettings = lazy(
  () => import('@/pages/Admin/AuthenticationSettings')
);
const NotFound = lazy(() => import('@/pages/Errors/NotFound'));
const WithingsCallback = lazy(
  () => import('@/pages/Integrations/WithingsCallback')
);
const FitbitCallback = lazy(
  () => import('@/pages/Integrations/FitbitCallback')
);
const PolarCallback = lazy(() => import('@/pages/Integrations/PolarCallback'));
const StravaCallback = lazy(
  () => import('@/pages/Integrations/StravaCallback')
);

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/login" />;
};

const PermissionRoute = ({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) => {
  const { hasPermission } = useActiveUser();

  if (hasPermission(permission)) {
    return <>{children}</>;
  }

  return <Navigate to="/" />;
};
export const ComponentFallback = () => {
  return null;
};
const Root = () => {
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [latestRelease, setLatestRelease] = useState(null);
  const [showNewReleaseDialog, setShowNewReleaseDialog] = useState(false);
  const { data: appVersion } = useCurrentVersionQuery();
  const navigate = useNavigate();

  const handleDismissRelease = (version: string) => {
    localStorage.setItem('dismissedReleaseVersion', version);
    setShowNewReleaseDialog(false);
  };

  useEffect(() => {
    if (window.location.pathname.includes('//')) {
      const normalizedPath = window.location.pathname.replace(/\/+/g, '/');
      navigate(normalizedPath + window.location.search, { replace: true });
    }
  }, [navigate]);

  return (
    <AuthProvider>
      <PreferencesProvider>
        <ThemeProvider>
          <ActiveUserProvider>
            <WaterContainerProvider>
              <LanguageHandler />
              <AppSetup
                setLatestRelease={setLatestRelease}
                setShowNewReleaseDialog={setShowNewReleaseDialog}
              />
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center">
                    Loading Site...
                  </div>
                }
              >
                <Outlet context={{ setShowAboutDialog }} />
              </Suspense>
              <ErrorBoundary
                fallback={<ComponentFallback />}
                onError={(error, { componentStack }) => {
                  logError(
                    getUserLoggingLevel(),
                    'DraggableChatbotButton failed:',
                    error,
                    componentStack
                  );
                }}
              >
                <DraggableChatbotButton />
              </ErrorBoundary>
              <ErrorBoundary
                fallback={<ComponentFallback />}
                onError={(error, { componentStack }) => {
                  logError(
                    getUserLoggingLevel(),
                    'DraggableChatbotButton failed:',
                    error,
                    componentStack
                  );
                }}
              >
                <AboutDialog
                  isOpen={showAboutDialog}
                  onClose={() => setShowAboutDialog(false)}
                  version={appVersion?.version ?? ''}
                />
              </ErrorBoundary>
              <ErrorBoundary
                fallback={<ComponentFallback />}
                onError={(error, { componentStack }) => {
                  logError(
                    getUserLoggingLevel(),
                    'DraggableChatbotButton failed:',
                    error,
                    componentStack
                  );
                }}
              >
                <NewReleaseDialog
                  isOpen={showNewReleaseDialog}
                  onClose={() => setShowNewReleaseDialog(false)}
                  releaseInfo={latestRelease}
                  onDismissForVersion={handleDismissRelease}
                />
              </ErrorBoundary>
              <Toaster />
            </WaterContainerProvider>
          </ActiveUserProvider>
        </ThemeProvider>
      </PreferencesProvider>
    </AuthProvider>
  );
};

interface OutletContextType {
  setShowAboutDialog: (show: boolean) => void;
}

const IndexWrapper = () => {
  const { setShowAboutDialog } = useOutletContext<OutletContextType>();
  return <Index onShowAboutDialog={() => setShowAboutDialog(true)} />;
};

const ReportsWrapper = () => {
  const { timezone } = usePreferences();
  return <Reports key={timezone} />;
};

const router = createBrowserRouter([
  {
    Component: Root,
    ErrorBoundary: RootErrorBoundary,
    children: [
      { path: '/login', Component: Auth, ErrorBoundary: RootErrorBoundary },
      {
        path: '/forgot-password',
        Component: ForgotPassword,
        ErrorBoundary: RootErrorBoundary,
      },
      {
        path: '/reset-password',
        Component: ResetPassword,
        ErrorBoundary: RootErrorBoundary,
      },
      {
        path: '/login/magic-link',
        Component: Auth,
        ErrorBoundary: RootErrorBoundary,
      },
      { path: '/error', Component: Auth, ErrorBoundary: RootErrorBoundary },
      {
        path: '/withings/callback',
        Component: WithingsCallback,
        ErrorBoundary: RootErrorBoundary,
      },
      {
        path: '/fitbit/callback',
        Component: FitbitCallback,
        ErrorBoundary: RootErrorBoundary,
      },
      {
        path: '/polar/callback',
        Component: PolarCallback,
        ErrorBoundary: RootErrorBoundary,
      },
      {
        path: '/strava/callback',
        Component: StravaCallback,
        ErrorBoundary: RootErrorBoundary,
      },
      {
        path: '/oidc-callback',
        Component: OidcCallback,
        ErrorBoundary: RootErrorBoundary,
      },
      {
        path: '/',
        element: (
          <PrivateRoute>
            <IndexWrapper />
          </PrivateRoute>
        ),
        ErrorBoundary: RootErrorBoundary,
        children: [
          { index: true, Component: Diary, ErrorBoundary: RouteErrorBoundary },
          {
            path: 'checkin',
            Component: CheckIn,
            ErrorBoundary: RouteErrorBoundary,
          },
          {
            path: 'reports',
            element: (
              <PermissionRoute permission="reports">
                <ReportsWrapper />
              </PermissionRoute>
            ),
            ErrorBoundary: RouteErrorBoundary,
          },
          {
            path: 'foods',
            Component: FoodDatabaseManager,
            ErrorBoundary: RouteErrorBoundary,
          },
          {
            path: 'exercises',
            Component: ExerciseDatabaseManager,
            ErrorBoundary: RouteErrorBoundary,
          },
          {
            path: 'goals',
            Component: GoalsSettings,
            ErrorBoundary: RouteErrorBoundary,
          },
          {
            path: 'settings',
            Component: Settings,
            ErrorBoundary: RouteErrorBoundary,
          },
          {
            path: 'admin',
            ErrorBoundary: RouteErrorBoundary,
            children: [
              {
                index: true,
                element: (
                  <PermissionRoute permission="admin">
                    <AdminPage />
                  </PermissionRoute>
                ),
                ErrorBoundary: RouteErrorBoundary,
              },
              {
                path: 'oidc-settings',
                element: (
                  <PermissionRoute permission="admin">
                    <AuthenticationSettings />
                  </PermissionRoute>
                ),
                ErrorBoundary: RouteErrorBoundary,
              },
              {
                path: 'user-management',
                element: (
                  <PermissionRoute permission="admin">
                    <UserManagement />
                  </PermissionRoute>
                ),
                ErrorBoundary: RouteErrorBoundary,
              },
            ],
          },
        ],
      },
      { path: '*', Component: NotFound },
    ],
  },
]);

const App = () => {
  return (
    <>
      <ReactQueryDevtools buttonPosition="top-left" initialIsOpen={false} />
      <ChatbotVisibilityProvider>
        <RouterProvider router={router} />
      </ChatbotVisibilityProvider>
    </>
  );
};

export default App;
