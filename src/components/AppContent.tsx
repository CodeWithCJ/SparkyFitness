import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ActiveUserProvider } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth'; // Import useAuth
import Index from '@/pages/Index';
import NotFound from '@/pages/NotFound';
import OidcSettings from '@/pages/Admin/OidcSettings'; // Import OidcSettings
import OidcCallback from '@/components/OidcCallback'; // Import OidcCallback
import Auth from '@/components/Auth'; // Import Auth component
import MealManagement from './MealManagement'; // Import MealManagement
import MealPlanCalendar from './MealPlanCalendar'; // Import MealPlanCalendar

interface AppContentProps {
  onShowAboutDialog: () => void;
}

const AppContent: React.FC<AppContentProps> = ({ onShowAboutDialog }) => {
  const { loggingLevel } = usePreferences();
  const { user, loading } = useAuth();
  const { t } = useLanguage();

  if (loading) {
    // Optionally, render a loading spinner or skeleton screen here
    return <div>{t('auth.loadingAuthentication')}</div>;
  }

  return (
    <ThemeProvider loggingLevel={loggingLevel}>
      <ActiveUserProvider> {/* No longer passing navigate */}
        <TooltipProvider>
          <Toaster />
          <Routes>
            <Route path="/" element={user ? <Index onShowAboutDialog={onShowAboutDialog} /> : <Auth />} />
            <Route path="/oidc-callback" element={<OidcCallback />} />
            <Route path="/meals" element={user ? <MealManagement /> : <Navigate to="/" />} />
            <Route path="/meal-plan" element={user ? <MealPlanCalendar /> : <Navigate to="/" />} />
            <Route path="/admin/oidc-settings" element={user ? <OidcSettings /> : <Navigate to="/" />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </ActiveUserProvider>
    </ThemeProvider>
  );
};

export default AppContent;