import type React from "react";
import { useState, useEffect, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { ChatbotVisibilityProvider } from "@/contexts/ChatbotVisibilityContext";
import LanguageHandler from "@/components/LanguageHandler";
import { WaterContainerProvider } from "@/contexts/WaterContainerContext";
import { ActiveUserProvider } from "@/contexts/ActiveUserContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import DraggableChatbotButton from "@/components/DraggableChatbotButton";
import AboutDialog from "@/components/AboutDialog";
import NewReleaseDialog from "@/components/NewReleaseDialog";
import AppSetup from "@/components/AppSetup";
import axios from "axios";
import { Toaster } from "@/components/ui/toaster";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { FastingProvider } from "@/contexts/FastingContext";
import OidcCallback from "@/components/OidcCallback";
import { useActiveUser } from "./contexts/ActiveUserContext";
const Auth = lazy(() => import("@/pages/Auth/Auth"));
const ForgotPassword = lazy(() => import("@/pages/Auth/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/Auth/ResetPassword"));
const Index = lazy(() => import("@/pages/Index"));
const Diary = lazy(() => import("@/pages/Diary/Diary"));
const CheckIn = lazy(() => import("./pages/CheckIn/CheckIn"));
const FoodDatabaseManager = lazy(() => import("./pages/Foods/Foods"));
const Reports = lazy(() => import("./pages/Reports/Reports"));
const ExerciseDatabaseManager = lazy(
  () => import("./pages/Exercises/Exercises"),
);
const GoalsSettings = lazy(() => import("./pages/Goals/Goals"));
const Settings = lazy(() => import("./pages/Settings/SettingsPage"));
const AdminPage = lazy(() => import("./pages/Admin/Admin"));
const UserManagement = lazy(() => import("@/pages/Admin/UserManagement"));
const AuthenticationSettings = lazy(
  () => import("@/pages/Admin/AuthenticationSettings"),
);
const NotFound = lazy(() => import("@/pages/Errors/NotFound"));
const WithingsCallback = lazy(
  () => import("@/pages/Integrations/WithingsCallback"),
);
const FitbitCallback = lazy(
  () => import("@/pages/Integrations/FitbitCallback"),
);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30,
      gcTime: 1000 * 60 * 60,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    },
    mutations: {
      retry: 0,
    },
  },
});

// A wrapper to protect routes that require authentication
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

// A wrapper to protect routes that require specific permissions
const PermissionRoute = ({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) => {
  const { hasPermission, isActingOnBehalf } = useActiveUser();

  if (hasPermission(permission)) {
    return <>{children}</>;
  }

  return <Navigate to="/" />; // Or show an "Access Denied" page
};

const App = () => {
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [latestRelease, setLatestRelease] = useState(null);
  const [showNewReleaseDialog, setShowNewReleaseDialog] = useState(false);
  const [appVersion, setAppVersion] = useState("unknown");

  useEffect(() => {
    // Other useEffects like network intercept, reload detection, etc. can remain
    const fetchVersion = async () => {
      try {
        const response = await axios.get("/api/version/current");
        setAppVersion(response.data.version);
      } catch (error) {
        console.error("Error fetching app version:", error);
      }
    };
    fetchVersion();
  }, []);

  const handleDismissRelease = (version: string) => {
    localStorage.setItem("dismissedReleaseVersion", version);
    setShowNewReleaseDialog(false);
  };

  const navigate = useNavigate();

  useEffect(() => {
    if (window.location.pathname.includes("//")) {
      const normalizedPath = window.location.pathname.replace(/\/+/g, "/");
      navigate(normalizedPath + window.location.search, { replace: true });
    }
  }, [navigate]);

  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <LanguageHandler />
        <ThemeProvider>
          <ChatbotVisibilityProvider>
            <ActiveUserProvider>
              <WaterContainerProvider>
                <AppSetup
                  setLatestRelease={setLatestRelease}
                  setShowNewReleaseDialog={setShowNewReleaseDialog}
                />
                <Suspense
                  fallback={
                    <div className="min-h-screen flex items-center justify-center">
                      Lade Seite...
                    </div>
                  }
                >
                  <Routes>
                    <Route path="/login" element={<Auth />} />
                    <Route
                      path="/forgot-password"
                      element={<ForgotPassword />}
                    />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/login/magic-link" element={<Auth />} />
                    <Route path="/error" element={<Auth />} />
                    <Route
                      path="/withings/callback"
                      element={<WithingsCallback />}
                    />
                    <Route
                      path="/fitbit/callback"
                      element={<FitbitCallback />}
                    />
                    <Route path="/oidc-callback" element={<OidcCallback />} />
                    <Route
                      path="/"
                      element={
                        <PrivateRoute>
                          <Index
                            onShowAboutDialog={() => setShowAboutDialog(true)}
                          />
                        </PrivateRoute>
                      }
                    >
                      <Route index element={<Diary />} />
                      <Route
                        path="checkin"
                        element={
                          <FastingProvider>
                            <CheckIn />
                          </FastingProvider>
                        }
                      />
                      <Route
                        path="reports"
                        element={
                          <PermissionRoute permission="reports">
                            <Reports />
                          </PermissionRoute>
                        }
                      />
                      <Route path="foods" element={<FoodDatabaseManager />} />
                      <Route
                        path="exercises"
                        element={<ExerciseDatabaseManager />}
                      />
                      <Route path="goals" element={<GoalsSettings />} />
                      <Route path="settings" element={<Settings />} />
                      <Route path="admin">
                        <Route
                          index
                          element={
                            <PermissionRoute permission="admin">
                              <AdminPage />
                            </PermissionRoute>
                          }
                        />
                        <Route
                          path="oidc-settings"
                          element={
                            <PermissionRoute permission="admin">
                              <AuthenticationSettings />
                            </PermissionRoute>
                          }
                        />
                        <Route
                          path="user-management"
                          element={
                            <PermissionRoute permission="admin">
                              <UserManagement />
                            </PermissionRoute>
                          }
                        />
                      </Route>
                    </Route>

                    {/* Catch-all route */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>

                <DraggableChatbotButton />
                <AboutDialog
                  isOpen={showAboutDialog}
                  onClose={() => setShowAboutDialog(false)}
                  version={appVersion}
                />
                <NewReleaseDialog
                  isOpen={showNewReleaseDialog}
                  onClose={() => setShowNewReleaseDialog(false)}
                  releaseInfo={latestRelease}
                  onDismissForVersion={handleDismissRelease}
                />
                <Toaster />
              </WaterContainerProvider>
            </ActiveUserProvider>
          </ChatbotVisibilityProvider>
        </ThemeProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
};

export default App;
