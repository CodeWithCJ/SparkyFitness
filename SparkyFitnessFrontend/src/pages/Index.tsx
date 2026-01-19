import SparkyChat from "@/components/SparkyChat";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, warn, error } from "@/utils/logging";
import { apiCall } from "@/services/api";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FastingProvider } from '@/contexts/FastingContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import FoodDiary from "@/components/FoodDiary";
import FoodDatabaseManager from "@/components/FoodDatabaseManager";
import ExerciseDatabaseManager from "@/components/ExerciseDatabaseManager";
import { PresetExercise } from "@/types/workout.d"; // Import PresetExercise
import Reports from "@/components/Reports";
import AddComp from "@/components/AddComp";
import CheckIn from "@/components/CheckIn";
import Settings from "@/components/Settings";
import GoalsSettings from "@/components/GoalsSettings"; // Import GoalsSettings
import ThemeToggle from "@/components/ThemeToggle";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import GitHubStarCounter from "@/components/GitHubStarCounter"; // Import GitHubStarCounter
import GitHubSponsorButton from "@/components/GitHubSponsorButton"; // Import GitHubSponsorButton
import { useAuth } from "@/hooks/useAuth";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import GlobalNotificationIcon from "@/components/GlobalNotificationIcon";
import {
  Home,
  Activity, // Used for Check-In
  BarChart3,
  Utensils, // Used for Foods
  Settings as SettingsIcon,
  LogOut,
  Dumbbell, // Used for Exercises
  Target, // Used for Goals
  Shield,
  Plus,
  X, // Add X here for the close icon
} from "lucide-react";
import { LucideIcon } from "lucide-react"; // Import LucideIcon
import { toast } from "@/hooks/use-toast";
import AuthenticationSettings from "@/pages/Admin/AuthenticationSettings";
import BackupSettings from "@/pages/Admin/BackupSettings";
import UserManagement from "@/pages/Admin/UserManagement"; // Import UserManagement
import axios from "axios";
import OnBoarding from "@/components/Onboarding/OnBoarding";
import { getOnboardingStatus } from "@/services/onboardingService";


interface AddCompItem {
  value: string;
  label: string;
  icon: LucideIcon;
}

interface IndexProps {
  onShowAboutDialog: () => void;
}

const Index: React.FC<IndexProps> = ({ onShowAboutDialog }) => {
  const { t } = useTranslation();
  const { user, signOut, loading: authLoading } = useAuth();
  const {
    isActingOnBehalf,
    hasPermission,
    hasWritePermission,
    activeUserName,
  } = useActiveUser();
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, "Index: Component rendered.");

  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  const [appVersion, setAppVersion] = useState("Loading...");
  const [isAddCompOpen, setIsAddCompOpen] = useState(false);
  const [exercisesToLogFromPreset, setExercisesToLogFromPreset] = useState<
    PresetExercise[] | undefined
  >(undefined);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await axios.get("/api/version/current");
        setAppVersion(response.data.version);
      } catch (err) {
        console.error("Error fetching app version for footer:", err);
        setAppVersion("Error");
      }
    };
    fetchVersion();
  }, []);

  const { formatDateInUserTimezone } = usePreferences();
  const [selectedDate, setSelectedDate] = useState(
    formatDateInUserTimezone(new Date(), "yyyy-MM-dd")
  );
  const [activeTab, setActiveTab] = useState<string>("");
  const [foodDiaryRefreshTrigger, setFoodDiaryRefreshTrigger] = useState(0);

  useEffect(() => {
    debug(loggingLevel, "Index: Setting up foodDiaryRefresh event listener.");
    const handleRefresh = () => {
      info(
        loggingLevel,
        "Index: Received foodDiaryRefresh event, triggering refresh."
      );
      setFoodDiaryRefreshTrigger((prev) => prev + 1);
    };

    window.addEventListener("foodDiaryRefresh", handleRefresh);
    return () => {
      debug(
        loggingLevel,
        "Index: Cleaning up foodDiaryRefresh event listener."
      );
      window.removeEventListener("foodDiaryRefresh", handleRefresh);
    };
  }, [loggingLevel]);

  const handleSignOut = async () => {
    info(loggingLevel, "Index: Attempting to sign out.");
    try {
      await signOut();
      toast({
        title: "Success",
        description: "Signed out successfully",
      });
    } catch (err) {
      error(loggingLevel, "Index: Sign out error:", err);
      toast({
        title: "Error",
        description: "Failed to sign out",
        variant: "destructive",
      });
    }
  };

  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (authLoading || !user) {
        if (!authLoading && !user) {
          setIsCheckingStatus(false);
        }
        return;
      }

      setIsCheckingStatus(true);
      try {
        const profile = await apiCall(`/auth/profiles`, {
          suppress404Toast: true,
        });
        setDisplayName(profile?.full_name || user.email || "");

        const { onboardingComplete } = await getOnboardingStatus();

        setNeedsOnboarding(!onboardingComplete);
      } catch (err) {
        error(
          loggingLevel,
          "Index: Error fetching profile or onboarding status:",
          err
        );
        setNeedsOnboarding(false);
      } finally {
        setIsCheckingStatus(false);
      }
    };

    checkOnboardingStatus();
  }, [user, authLoading, loggingLevel]);

  const addCompItems: AddCompItem[] = useMemo(() => {
    const items: AddCompItem[] = [];
    if (!isActingOnBehalf) {
      items.push(
        { value: "checkin", label: "Check-In", icon: Activity },
        { value: "foods", label: "Foods", icon: Utensils },
        { value: "exercises", label: t('exercise.title', 'Exercises'), icon: Dumbbell },
        { value: "goals", label: "Goals", icon: Target }
      );
    } else {
      if (hasWritePermission("checkin")) {
        items.push({ value: "checkin", label: "Check-In", icon: Activity });
      }
    }
    return items;
  }, [isActingOnBehalf, hasWritePermission]);

  const availableMobileTabs = useMemo(() => {
    debug(loggingLevel, "Index: Calculating available tabs in mobile view.", {
      isActingOnBehalf,
      hasPermission,
      hasWritePermission,
      isAddCompOpen,
    });
    const mobileTabs = [];
    if (!isActingOnBehalf) {
      mobileTabs.push(
        { value: "home", label: t('nav.diary'), icon: Home },
        { value: "reports", label: t('nav.reports'), icon: BarChart3 },
        { value: "Add", label: t('common.add', 'Add'), icon: isAddCompOpen ? X : Plus },
        { value: "settings", label: t('nav.settings'), icon: SettingsIcon }
      );
    } else {
      if (hasWritePermission("diary")) {
        mobileTabs.push({ value: "home", label: t('nav.diary'), icon: Home });
      }
      if (hasWritePermission("checkin")) {
        mobileTabs.push({
          value: "checkin",
          label: t('nav.checkin'),
          icon: Activity,
        });
      }
      if (hasPermission("reports")) {
        mobileTabs.push({
          value: "reports",
          label: t('nav.reports'),
          icon: BarChart3,
        });
      }
    }
    if (user?.role === "admin" && !isActingOnBehalf) {
      mobileTabs.push({ value: "admin", label: t('nav.admin'), icon: Shield });
    }
    return mobileTabs;
  }, [
    isActingOnBehalf,
    hasPermission,
    hasWritePermission,
    loggingLevel,
    user?.role,
    isAddCompOpen,
  ]);

  const availableTabs = useMemo(() => {
    debug(loggingLevel, "Index: Calculating available tabs.", {
      isActingOnBehalf,
      hasPermission,
      hasWritePermission,
    });
    const tabs = [];
    if (!isActingOnBehalf) {
      tabs.push(
        { value: "home", label: t('nav.diary'), icon: Home },
        { value: "checkin", label: t('nav.checkin'), icon: Activity },
        { value: "reports", label: t('nav.reports'), icon: BarChart3 },
        { value: "foods", label: t('nav.foods'), icon: Utensils },
        { value: "exercises", label: t('exercise.title', 'Exercises'), icon: Dumbbell },
        { value: "goals", label: t('nav.goals'), icon: Target },
        { value: "settings", label: t('nav.settings'), icon: SettingsIcon }
      );
    } else {
      if (hasWritePermission("diary")) {
        tabs.push({ value: "home", label: t('nav.diary'), icon: Home });
      }
      if (hasWritePermission("checkin")) {
        tabs.push({ value: "checkin", label: t('nav.checkin'), icon: Activity });
      }
      if (hasPermission("reports")) {
        tabs.push({ value: "reports", label: t('nav.reports'), icon: BarChart3 });
      }
    }
    if (user?.role === "admin" && !isActingOnBehalf) {
      tabs.push({ value: "admin", label: t('nav.admin'), icon: Shield });
    }
    return tabs;
  }, [
    isActingOnBehalf,
    hasPermission,
    hasWritePermission,
    loggingLevel,
    user?.role,
  ]);

  useEffect(() => {
    if (user && availableTabs.length > 0 && !activeTab) {
      setActiveTab("home");
    } else if (availableTabs.length === 0 && activeTab) {
      setActiveTab("");
    }
  }, [availableTabs, activeTab, user]);

  useEffect(() => {
    if (user && availableMobileTabs.length > 0 && !activeTab) {
      setActiveTab("home");
    } else if (availableMobileTabs.length === 0 && activeTab) {
      setActiveTab("");
    }
  }, [availableMobileTabs, activeTab, user]);

  const handleNavigateFromAddComp = useCallback(
    (value: string) => {
      info(loggingLevel, `Index: Navigating to ${value} from AddComp.`);
      setActiveTab(value);
      setIsAddCompOpen(false);
    },
    [loggingLevel]
  );

  const getGridClass = (count: number) => {
    switch (count) {
      case 1:
        return "grid-cols-1";
      case 2:
        return "grid-cols-2";
      case 3:
        return "grid-cols-3";
      case 4:
        return "grid-cols-4";
      case 5:
        return "grid-cols-5";
      case 6:
        return "grid-cols-6";
      case 7:
        return "grid-cols-7";
      case 8:
        return "grid-cols-8";
      default:
        return "grid-cols-7";
    }
  };

  const gridClass = getGridClass(availableTabs.length);
  const mobileGridClass = getGridClass(availableMobileTabs.length);

  if (isCheckingStatus) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-xl text-white">Loading...</p>
      </div>
    );
  }

  if (needsOnboarding) {
    return <OnBoarding onOnboardingComplete={() => setNeedsOnboarding(false)} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-1"> {/* Adjusted gap for tighter spacing */}
            <img
              src="/images/SparkyFitness.png"
              alt="SparkyFitness Logo"
              className="h-12 w-auto"
            />
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-slate-300">
              SparkyFitness
            </h1>
            <GitHubStarCounter owner="CodeWithCJ" repo="SparkyFitness" />
            <GitHubSponsorButton owner="CodeWithCJ" />
          </div>
          <div className="flex items-center gap-2">
            <ProfileSwitcher />
            <span className="text-sm text-muted-foreground hidden sm:inline">
              Welcome {isActingOnBehalf ? activeUserName : displayName}
            </span>

            <GlobalNotificationIcon />
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

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (value === "Add") {
              setIsAddCompOpen((prev) => !prev);
            } else {
              setIsAddCompOpen(false);
              setActiveTab(value);
            }
          }}
          className="space-y-6"
        >
          <TabsList className={`hidden sm:grid w-full gap-1 ${gridClass}`}>
            {availableTabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-900"
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsList
            className={`grid w-full gap-1 fixed bottom-0 left-0 right-0 sm:hidden bg-background border-t py-2 px-2 h-14 z-50 ${mobileGridClass}`}
          >
            {availableMobileTabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex flex-col items-center gap-1 py-2"
              >
                <Icon className="h-8 w-8" />
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="pb-16 sm:pb-0">
            <TabsContent value="home" className="space-y-6">

              <FoodDiary
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                refreshTrigger={foodDiaryRefreshTrigger}
                initialExercisesToLog={exercisesToLogFromPreset}
                onExercisesLogged={() => setExercisesToLogFromPreset(undefined)}
              />
            </TabsContent>
            <TabsContent value="checkin" className="space-y-6">
              {activeTab === 'checkin' && (
                <FastingProvider>
                  <CheckIn />
                </FastingProvider>
              )}
            </TabsContent>
            <TabsContent value="reports" className="space-y-6">
              <Reports />
            </TabsContent>
            <TabsContent value="foods" className="space-y-6">
              <FoodDatabaseManager />
            </TabsContent>
            <TabsContent value="exercises" className="space-y-6">
              <ExerciseDatabaseManager
                onPresetExercisesSelected={setExercisesToLogFromPreset}
              />
            </TabsContent>
            <TabsContent value="goals" className="space-y-6">
              <GoalsSettings />
            </TabsContent>
            <TabsContent value="settings" className="space-y-6">
              <Settings onShowAboutDialog={onShowAboutDialog} />
            </TabsContent>
            {user?.role === "admin" && (
              <TabsContent value="admin" className="space-y-6">
                <div className="flex flex-col space-y-4">
                  <AuthenticationSettings />
                  <BackupSettings />
                  <UserManagement />
                </div>
              </TabsContent>
            )}
          </div>
        </Tabs>

        <SparkyChat />
      </div>

      <AddComp
        isVisible={isAddCompOpen}
        onClose={() => setIsAddCompOpen(false)}
        items={addCompItems}
        onNavigate={handleNavigateFromAddComp}
      />

      <footer className="hidden sm:block text-center text-muted-foreground text-sm py-4">
        <p className="cursor-pointer underline" onClick={onShowAboutDialog}>
          SparkyFitness v{appVersion}
        </p>
      </footer>
    </div>
  );
};

export default Index;
