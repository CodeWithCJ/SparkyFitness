import type React from 'react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, Outlet, useNavigate } from 'react-router-dom';
import { debug, info, error } from '@/utils/logging';
import {
  Home,
  Activity, // Used for Check-In
  CalendarHeart,
  BarChart3,
  Utensils, // Used for Foods
  Settings as SettingsIcon,
  LogOut,
  Dumbbell, // Used for Exercises
  Target, // Used for Goals
  Pill, // Used for Medications
  Shield,
  Plus,
  X,
  Coffee, // Used for Breakfast
  Sandwich, // Used for Lunch
  Cookie, // Used for Snacks
  UtensilsCrossed, // Used for Dinner
  Salad, // Used for Food Log
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

import SparkyChat from '../pages/Chat/SparkyChat';
import AddComp from '@/layouts/AddComp';
import ThemeToggle from '@/components/ThemeToggle';
import GlobalSyncButton from '@/components/GlobalSyncButton';
import ProfileSwitcher from '@/components/ProfileSwitcher';
import GitHubStarCounter from '@/components/GitHubStarCounter';
import GitHubSponsorButton from '@/components/GitHubSponsorButton';
import GlobalNotificationIcon from '@/components/GlobalNotificationIcon';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMealTypes } from '@/hooks/Diary/useMealTypes';
import { useCurrentVersionQuery } from '@/hooks/useGeneralQueries';
import { useCycleSettings } from '@/hooks/useCycle';
import { cn } from '@/lib/utils';
import { getGridClassNormal } from '@/utils/layout';

interface AddCompItem {
  value: string;
  label: string;
  icon: LucideIcon;
  fullWidth?: boolean;
}

interface MainLayoutProps {
  onShowAboutDialog: () => void;
  onShowNewReleaseDialog: () => void;
  onStartOnboarding?: () => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({
  onShowAboutDialog,
  onShowNewReleaseDialog,
  onStartOnboarding,
}) => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    isActingOnBehalf,
    hasPermission,
    hasWritePermission,
    activeUserName,
  } = useActiveUser();
  const { getDateRelationToToday, loggingLevel } = usePreferences();
  debug(loggingLevel, 'MainLayout: Component rendered.');

  const { data: appVersion } = useCurrentVersionQuery();
  const [isAddCompOpen, setIsAddCompOpen] = useState(false);
  const [isMealTypeSelectOpen, setIsMealTypeSelectOpen] = useState(false);

  // Fetch meal types for quick log menu
  const { data: mealTypes } = useMealTypes();

  // Fetch cycle settings to determine tab visibility
  const { data: cycleSettings } = useCycleSettings();

  const handleSignOut = async () => {
    info(loggingLevel, 'MainLayout: Attempting to sign out.');
    try {
      await signOut();
      toast({
        title: 'Success',
        description: 'Signed out successfully',
      });
      navigate('/login'); // Navigate to login page after sign out
    } catch (err) {
      error(loggingLevel, 'MainLayout: Sign out error:', err);
      toast({
        title: 'Error',
        description: 'Failed to sign out',
        variant: 'destructive',
      });
    }
  };

  const addCompItems: AddCompItem[] = useMemo(() => {
    const items: AddCompItem[] = [];
    if (!isActingOnBehalf) {
      // Keep this order consistent with the desktop tab order in availableTabs:
      // Check-In, Cycle, Medications, Foods, Exercises, Goals.
      items.push({ value: 'checkin', label: 'Check-In', icon: Activity });
      if (cycleSettings?.enabled) {
        items.push({
          value: 'cycle',
          label: cycleSettings.discreet_mode
            ? t('nav.wellness', 'Wellness')
            : cycleSettings.mode === 'pregnant'
              ? t('nav.pregnancy', 'Pregnancy')
              : t('nav.cycle', 'Cycle'),
          icon: cycleSettings.discreet_mode ? Activity : CalendarHeart,
        });
      }
      items.push(
        {
          value: 'medications',
          label: t('nav.medications', 'Medications'),
          icon: Pill,
        },
        { value: 'foods', label: 'Foods', icon: Utensils },
        {
          value: 'exercises',
          label: t('exercise.title', 'Exercises'),
          icon: Dumbbell,
        },
        { value: 'goals', label: 'Goals', icon: Target },
        {
          value: 'foodlog',
          label: t('nav.foodLog', 'Food Log'),
          icon: Salad,
          fullWidth: true,
        }
      );
    } else {
      if (hasWritePermission('checkin')) {
        items.push({ value: 'checkin', label: 'Check-In', icon: Activity });
      }
      if (hasWritePermission('diary')) {
        items.push({
          value: 'foodlog',
          label: t('nav.foodLog', 'Food Log'),
          icon: Salad,
          fullWidth: true,
        });
      }
    }
    return items;
  }, [isActingOnBehalf, hasWritePermission, cycleSettings, t]);

  // Map meal type names to icons
  const getMealTypeIcon = useCallback((name: string): LucideIcon => {
    const lowerName = name.toLowerCase();
    switch (lowerName) {
      case 'breakfast':
        return Coffee;
      case 'lunch':
        return Sandwich;
      case 'dinner':
        return UtensilsCrossed;
      case 'snacks':
        return Cookie;
      default:
        return UtensilsCrossed; // Default icon for custom meal types
    }
  }, []);

  // Get display name for meal type
  const getMealTypeLabel = useCallback(
    (name: string): string => {
      const lowerName = name.toLowerCase();
      switch (lowerName) {
        case 'breakfast':
          return t('common.breakfast', 'Breakfast');
        case 'lunch':
          return t('common.lunch', 'Lunch');
        case 'dinner':
          return t('common.dinner', 'Dinner');
        case 'snacks':
          return t('common.snacks', 'Snacks');
        default:
          return name; // Custom meal types use their own name
      }
    },
    [t]
  );

  // Generate meal type items from API
  const mealTypeItems: AddCompItem[] = useMemo(() => {
    if (!mealTypes) return [];

    return mealTypes
      .filter((mt) => mt.show_in_quick_log !== false)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((mt) => ({
        value: mt.name.toLowerCase(),
        label: getMealTypeLabel(mt.name),
        icon: getMealTypeIcon(mt.name),
      }));
  }, [mealTypes, getMealTypeLabel, getMealTypeIcon]);

  const availableTabs = useMemo(() => {
    debug(loggingLevel, 'MainLayout: Calculating available tabs (desktop).', {
      isActingOnBehalf,
      hasPermission,
      hasWritePermission,
    });
    const tabs = [];
    if (!isActingOnBehalf) {
      tabs.push(
        { value: '/', label: t('nav.diary'), icon: Home },
        { value: '/checkin', label: t('nav.checkin'), icon: Activity }
      );
      if (cycleSettings?.enabled) {
        tabs.push({
          value: '/cycle',
          label: cycleSettings.discreet_mode
            ? t('nav.wellness', 'Wellness')
            : cycleSettings.mode === 'pregnant'
              ? t('nav.pregnancy', 'Pregnancy')
              : t('nav.cycle', 'Cycle'),
          icon: cycleSettings.discreet_mode ? Activity : CalendarHeart,
        });
      }
      tabs.push(
        {
          value: '/medications',
          label: t('nav.medications', 'Medications'),
          icon: Pill,
        },
        { value: '/reports', label: t('nav.reports'), icon: BarChart3 },
        { value: '/foods', label: t('nav.foods'), icon: Utensils },
        {
          value: '/exercises',
          label: t('exercise.title', 'Exercises'),
          icon: Dumbbell,
        },
        { value: '/goals', label: t('nav.goals'), icon: Target },
        { value: '/settings', label: t('nav.settings'), icon: SettingsIcon }
      );
    } else {
      if (hasWritePermission('diary')) {
        tabs.push({ value: '/', label: t('nav.diary'), icon: Home });
      }
      if (hasWritePermission('checkin')) {
        tabs.push({
          value: '/checkin',
          label: t('nav.checkin'),
          icon: Activity,
        });
      }
      if (hasPermission('reports')) {
        tabs.push({
          value: '/reports',
          label: t('nav.reports'),
          icon: BarChart3,
        });
      }
      if (hasWritePermission('can_manage_medications')) {
        tabs.push({
          value: '/medications',
          label: t('nav.medications', 'Medications'),
          icon: Pill,
        });
      }
    }
    if (user?.role === 'admin' && !isActingOnBehalf) {
      tabs.push({ value: '/admin', label: t('nav.admin'), icon: Shield });
    }
    return tabs;
  }, [
    isActingOnBehalf,
    hasPermission,
    hasWritePermission,
    loggingLevel,
    user?.role,
    t,
    cycleSettings,
  ]);

  const availableMobileTabs = useMemo(() => {
    debug(loggingLevel, 'MainLayout: Calculating available tabs (mobile).', {
      isActingOnBehalf,
      hasPermission,
      hasWritePermission,
      isAddCompOpen,
    });
    const mobileTabs = [];
    // Cycle/Pregnancy and Medications live in the "+" Add menu on mobile
    // (see addCompItems), not the bottom bar, to keep the bar uncluttered.
    if (!isActingOnBehalf) {
      mobileTabs.push(
        { value: '/', label: t('nav.diary'), icon: Home },
        { value: '/reports', label: t('nav.reports'), icon: BarChart3 },
        {
          value: 'Add',
          label: t('common.add', 'Add'),
          icon: isAddCompOpen ? X : Plus,
        },
        { value: '/settings', label: t('nav.settings'), icon: SettingsIcon }
      );
    } else {
      if (hasWritePermission('diary')) {
        mobileTabs.push({ value: '/', label: t('nav.diary'), icon: Home });
      }
      if (hasWritePermission('checkin')) {
        mobileTabs.push({
          value: '/checkin',
          label: t('nav.checkin'),
          icon: Activity,
        });
      }
      if (hasPermission('reports')) {
        mobileTabs.push({
          value: '/reports',
          label: t('nav.reports'),
          icon: BarChart3,
        });
      }
      // Delegates have no "+" Add menu on mobile, so medications stays in the bar.
      if (hasWritePermission('can_manage_medications')) {
        mobileTabs.push({
          value: '/medications',
          label: t('nav.medications', 'Medications'),
          icon: Pill,
        });
      }
    }
    if (user?.role === 'admin' && !isActingOnBehalf) {
      mobileTabs.push({ value: '/admin', label: t('nav.admin'), icon: Shield });
    }
    return mobileTabs;
  }, [
    isActingOnBehalf,
    hasPermission,
    hasWritePermission,
    loggingLevel,
    user?.role,
    isAddCompOpen,
    t,
  ]);

  const handleNavigateFromAddComp = useCallback(
    (value: string) => {
      info(loggingLevel, `MainLayout: Navigating to ${value} from AddComp.`);
      if (value === 'foodlog') {
        setIsAddCompOpen(false);
        setIsMealTypeSelectOpen(true);
      } else {
        navigate(value);
        setIsAddCompOpen(false);
      }
    },
    [loggingLevel, navigate]
  );

  const handleMealTypeSelect = useCallback(
    (mealType: string) => {
      info(
        loggingLevel,
        `MainLayout: Meal type ${mealType} selected, navigating to diary.`
      );
      debug(
        loggingLevel,
        `[MainLayout] Navigating to diary with meal type: ${mealType}`
      );
      setIsMealTypeSelectOpen(false);
      navigate('/', { state: { openFoodSearchForMeal: mealType } });
    },
    [loggingLevel, navigate]
  );

  const gridClass = getGridClassNormal(availableTabs.length);
  const mobileGridClass = getGridClassNormal(availableMobileTabs.length);

  const location = useLocation();

  // Whether the current route is reachable for the active profile. When acting
  // on behalf, a delegate only has a subset of tabs; landing on a disallowed
  // route (e.g. staying on Diary after switching to a checkin-only profile)
  // would otherwise mount that page and fire requests that 403.
  const isCurrentPathAllowed = useMemo(() => {
    if (!isActingOnBehalf || availableTabs.length === 0) {
      return true;
    }
    const currentPath = location.pathname;
    // Match exactly or as prefix (e.g. /medications/log should match /medications)
    return availableTabs.some((tab) => {
      if (tab.value === '/') {
        return (
          currentPath === '/' ||
          currentPath === '/workout-playback' ||
          currentPath.startsWith('/workout-playback/')
        );
      }
      return (
        currentPath === tab.value || currentPath.startsWith(tab.value + '/')
      );
    });
  }, [isActingOnBehalf, availableTabs, location.pathname]);

  useEffect(() => {
    if (!isCurrentPathAllowed) {
      const fallbackTab = availableTabs[0]?.value;
      if (fallbackTab) {
        debug(
          loggingLevel,
          `MainLayout: Redirecting from unauthorized path ${location.pathname} to ${fallbackTab}`
        );
        navigate(fallbackTab, { replace: true });
      }
    }
  }, [
    isCurrentPathAllowed,
    availableTabs,
    location.pathname,
    navigate,
    loggingLevel,
  ]);

  const selectedDate = new URLSearchParams(location.search).get('date');
  const selectedDateRelation = selectedDate
    ? getDateRelationToToday(selectedDate)
    : 'today';

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-1">
            <img
              src="/images/SparkyFitness.webp"
              alt="SparkyFitness Logo"
              width={54}
              height={72}
            />
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-slate-300">
              SparkyFitness
            </h1>
            {!isMobile && (
              <>
                <GitHubStarCounter owner="CodeWithCJ" repo="SparkyFitness" />
                <GitHubSponsorButton owner="CodeWithCJ" />
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ProfileSwitcher />
            <span className="text-sm text-muted-foreground hidden sm:inline">
              Welcome {activeUserName}
            </span>

            {onStartOnboarding && (
              <Button
                variant="outline"
                size="sm"
                onClick={onStartOnboarding}
                className="flex items-center gap-2"
                title="Complete your setup"
              >
                <span className="hidden sm:inline">
                  {t('onboarding.completeSetup', 'Complete Setup')}
                </span>
                <span className="sm:hidden">Setup</span>
              </Button>
            )}
            <GlobalNotificationIcon />
            <GlobalSyncButton />
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline dark:text-slate-300">
                Sign Out
              </span>
            </Button>
          </div>
        </div>
        <nav
          className={cn(
            'relative hidden sm:grid w-full gap-1 mb-6 bg-slate-200/60 dark:bg-muted/50 p-1 rounded-lg border transition-colors overflow-hidden',
            gridClass,
            selectedDateRelation === 'today' && 'border-transparent',
            selectedDateRelation === 'past' && 'border-date-past/40',
            selectedDateRelation === 'future' && 'border-date-future/40'
          )}
        >
          {selectedDateRelation !== 'today' && (
            <div
              className={cn(
                'absolute inset-0 pointer-events-none z-10',
                selectedDateRelation === 'past' && 'bg-date-past/10',
                selectedDateRelation === 'future' && 'bg-date-future/10'
              )}
            />
          )}
          {availableTabs.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant="ghost"
              className={`relative flex items-center gap-2 hover:bg-background/50 transition-all ${
                location.pathname === value
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground'
              }`}
              onClick={() => navigate(value)}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </Button>
          ))}
        </nav>

        {/* Mobile Navigation */}
        <nav
          className={cn(
            'apple-safe-area sm:hidden fixed bottom-0 left-0 right-0 z-50 w-full bg-background border-t transition-colors overflow-hidden',
            selectedDateRelation === 'past' && 'border-date-past/80',
            selectedDateRelation === 'future' && 'border-date-future/50'
          )}
        >
          {selectedDateRelation !== 'today' && (
            <div
              className={cn(
                'absolute inset-0 pointer-events-none z-10',
                selectedDateRelation === 'past' && 'bg-date-past/10',
                selectedDateRelation === 'future' && 'bg-date-future/10'
              )}
            />
          )}
          <div
            className={`relative h-14 grid ${mobileGridClass} items-center justify-items-center`}
          >
            {availableMobileTabs.map(({ value, icon: Icon }) => (
              <Button
                key={value}
                variant="ghost"
                className={`flex flex-col items-center gap-1 py-2 ${
                  location.pathname ===
                  (value === 'Add' ? location.pathname : value)
                    ? 'text-primary'
                    : ''
                }`}
                onClick={() => {
                  if (value === 'Add') {
                    setIsAddCompOpen((prev) => !prev);
                  } else {
                    setIsAddCompOpen(false);
                    navigate(value);
                  }
                }}
              >
                <Icon className="h-8 w-8" />
              </Button>
            ))}
          </div>
        </nav>

        <div className="pb-16 sm:pb-0">
          {/* Don't mount a disallowed page while the redirect effect runs, or it
              fires requests the active profile isn't permitted to make. */}
          {isCurrentPathAllowed ? <Outlet /> : null}
        </div>

        <SparkyChat />
      </div>

      <AddComp
        isVisible={isAddCompOpen}
        onClose={() => setIsAddCompOpen(false)}
        items={addCompItems}
        onNavigate={handleNavigateFromAddComp}
      />

      <AddComp
        isVisible={isMealTypeSelectOpen}
        onClose={() => setIsMealTypeSelectOpen(false)}
        items={mealTypeItems}
        onNavigate={handleMealTypeSelect}
        title={t('foodDiary.selectMealType', 'Select Meal Type')}
      />

      <footer className="text-center text-muted-foreground text-sm py-4">
        {isMobile ? (
          <div className="flex flex-col items-center gap-2 mb-14">
            <div className="flex justify-center gap-2">
              <GitHubStarCounter owner="CodeWithCJ" repo="SparkyFitness" />
              <GitHubSponsorButton owner="CodeWithCJ" />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="cursor-pointer underline bg-transparent border-0 p-0 text-inherit font-normal text-sm"
                onClick={onShowAboutDialog}
              >
                SparkyFitness v{appVersion?.version ?? ''}
              </button>
              <span>•</span>
              <button
                type="button"
                className="cursor-pointer underline hover:text-foreground bg-transparent border-0 p-0 text-inherit font-normal text-sm"
                onClick={onShowNewReleaseDialog}
              >
                What's New
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center items-center gap-4">
            <button
              type="button"
              className="cursor-pointer underline bg-transparent border-0 p-0 text-inherit font-normal text-sm"
              onClick={onShowAboutDialog}
            >
              SparkyFitness v{appVersion?.version ?? ''}
            </button>
            <span>•</span>
            <button
              type="button"
              className="cursor-pointer underline hover:text-foreground bg-transparent border-0 p-0 text-inherit font-normal text-sm"
              onClick={onShowNewReleaseDialog}
            >
              What's New
            </button>
          </div>
        )}
      </footer>
    </div>
  );
};

export default MainLayout;
