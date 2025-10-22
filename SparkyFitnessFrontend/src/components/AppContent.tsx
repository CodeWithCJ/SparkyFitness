import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ActiveUserProvider, useActiveUser } from "@/contexts/ActiveUserContext"; // Import useActiveUser
import { usePreferences } from "@/contexts/PreferencesContext";
import { useAuth } from "@/hooks/useAuth"; // Import useAuth
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";
import AuthenticationSettings from "@/pages/Admin/AuthenticationSettings"; // Import AuthenticationSettings
import UserManagement from "@/pages/Admin/UserManagement"; // Import UserManagement
import OidcCallback from "@/components/OidcCallback"; // Import OidcCallback
import Auth from "@/components/Auth"; // Import Auth component
import MealManagement from "./MealManagement"; // Import MealManagement
import MealPlanCalendar from "./MealPlanCalendar"; // Import MealPlanCalendar
import MoodReports from "./reports/MoodReports"; // Import MoodReports

interface AppContentProps {
  onShowAboutDialog: () => void;
}

const AppContent: React.FC<AppContentProps> = ({ onShowAboutDialog }) => {
  const { loggingLevel } = usePreferences();
  const { user, loading } = useAuth();
  const { hasPermission, isActingOnBehalf } = useActiveUser(); // Use useActiveUser

  if (loading) {
    return (
      <ThemeProvider loggingLevel={loggingLevel}>
        <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          Loading authentication...
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider loggingLevel={loggingLevel}>
      <TooltipProvider>
        <Toaster />
        <Routes>
          <Route
            path="/"
            element={
              user ? (
                <Index onShowAboutDialog={onShowAboutDialog} />
              ) : (
                <Auth />
              )
            }
          />
          <Route path="/oidc-callback" element={<OidcCallback />} />
          {/* Conditionally render MealManagement based on 'diary' permission */}
          <Route
            path="/meals"
            element={user && (hasPermission('diary') || !isActingOnBehalf) ? <MealManagement /> : <Navigate to="/" />}
          />
          {/* Conditionally render MealPlanCalendar based on 'diary' permission */}
          <Route
            path="/meal-plan"
            element={user && (hasPermission('diary') || !isActingOnBehalf) ? <MealPlanCalendar /> : <Navigate to="/" />}
          />
          <Route
            path="/admin/oidc-settings"
            element={user ? <AuthenticationSettings /> : <Navigate to="/" />}
          />
          <Route
            path="/admin/user-management"
            element={user ? <UserManagement /> : <Navigate to="/" />}
          />
          {/* Conditionally render MoodReports based on 'reports' permission */}
          <Route
            path="/reports/mood"
            element={user && (hasPermission('reports') || !isActingOnBehalf) ? <MoodReports /> : <Navigate to="/" />}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </ThemeProvider>
  );
};

export default AppContent;
