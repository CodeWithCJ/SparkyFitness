import SparkyChat from "@/components/SparkyChat";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, warn, error } from "@/utils/logging";
import { apiCall } from "@/services/api";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import FoodDiary from "@/components/FoodDiary";
import FoodDatabaseManager from "@/components/FoodDatabaseManager";
import ExerciseDatabaseManager from "@/components/ExerciseDatabaseManager";
import { PresetExercise } from "@/types/workout"; // Import PresetExercise
import Reports from "@/components/Reports";
import AddComp from "@/components/AddComp";
import CheckIn from "@/components/CheckIn";
import Settings from "@/components/Settings";
import GoalsSettings from "@/components/GoalsSettings"; // Import GoalsSettings
import ThemeToggle from "@/components/ThemeToggle";
import ProfileSwitcher from "@/components/ProfileSwitcher";
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
  X, // Add X here for the close icon
} from "lucide-react";
import { LucideIcon } from "lucide-react"; // Import LucideIcon
import { toast } from "@/hooks/use-toast";
import AuthenticationSettings from "@/pages/Admin/AuthenticationSettings";
import BackupSettings from "@/pages/Admin/BackupSettings";
import UserManagement from "@/pages/Admin/UserManagement"; // Import UserManagement
import axios from "axios";

import { API_BASE_URL } from "@/services/api";

// Define an interface for AddComp items, matching what AddComp expects
interface AddCompItem {
  value: string;
  label: string;
  icon: LucideIcon;
}

interface IndexProps {
  onShowAboutDialog: () => void;
}

const Index: React.FC<IndexProps> = ({ onShowAboutDialog }) => {
  const { user, signOut, loading } = useAuth();
  const {
    isActingOnBehalf,
    hasPermission,
    hasWritePermission,
    activeUserName,
  } = useActiveUser();
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, "Index: Component rendered.");

  const [appVersion, setAppVersion] = useState("Loading...");
  const [isAddCompOpen, setIsAddCompOpen] = useState(false); // Renamed from showAddComp
  const [exercisesToLogFromPreset, setExercisesToLogFromPreset] = useState<PresetExercise[] | undefined>(undefined);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await axios.get("/api/version/current");
        setAppVersion(response.data.version);
      } catch (error) {
        console.error("Error fetching app version for footer:", error);
        setAppVersion("Error");
      }
    };
    fetchVersion();
  }, []);

  const { formatDateInUserTimezone } = usePreferences();
  const [selectedDate, setSelectedDate] = useState(
    formatDateInUserTimezone(new Date(), "yyyy-MM-dd"),
  );
  const [activeTab, setActiveTab] = useState<string>("");
  const [foodDiaryRefreshTrigger, setFoodDiaryRefreshTrigger] = useState(0);

  // Listen for global foodDiaryRefresh events
  useEffect(() => {
    debug(loggingLevel, "Index: Setting up foodDiaryRefresh event listener.");
    const handleRefresh = () => {
      info(
        loggingLevel,
        "Index: Received foodDiaryRefresh event, triggering refresh.",
      );
      setFoodDiaryRefreshTrigger((prev) => prev + 1);
    };

    window.addEventListener("foodDiaryRefresh", handleRefresh);
    return () => {
      debug(
        loggingLevel,
        "Index: Cleaning up foodDiaryRefresh event listener.",
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
    } catch (error) {
      error(loggingLevel, "Index: Sign out error:", error);
      toast({
        title: "Error",
        description: "Failed to sign out",
        variant: "destructive",
      });
    }
  };

  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const fetchDisplayName = async () => {
      if (!loading && user?.id) {
        try {
          const profile = await apiCall(`/auth/profiles`, {
            suppress404Toast: true,
          });
          setDisplayName(profile?.full_name || user.email || "");
        } catch (err) {
          if (err.message && err.message.includes("404")) {
            setDisplayName(user.email || "");
          } else {
            error(
              loggingLevel,
              "Index: Error fetching profile for display name:",
              err,
            );
            setDisplayName(user.email || "");
          }
        }
      } else if (!loading && !user) {
        setDisplayName("");
      }
    };
    fetchDisplayName();
  }, [user, loading, loggingLevel]);

  // Define items for the AddComp semicircle
  const addCompItems: AddCompItem[] = useMemo(() => {
    const items: AddCompItem[] = [];
    if (!isActingOnBehalf) {
      // If user is acting on their own behalf
      items.push(
        { value: "checkin", label: "Check-In", icon: Activity },
        { value: "foods", label: "Foods", icon: Utensils },
        { value: "exercises", label: "Exercises", icon: Dumbbell },
        { value: "goals", label: "Goals", icon: Target },
      );
    } else {
      // If acting on behalf, filter by permissions
      if (hasWritePermission("checkin")) {
        items.push({ value: "checkin", label: "Check-In", icon: Activity });
      }
      // Assuming 'foods', 'exercises', 'goals' would also be permission-based if acting on behalf
      // For now, I'll keep them out for acting on behalf as per the original commented structure
      // You can add permission checks here if needed for these items.
    }
    return items;
  }, [isActingOnBehalf, hasWritePermission]);

  // Memoize available mobile tabs
  const availableMobileTabs = useMemo(() => {
    debug(loggingLevel, "Index: Calculating available tabs in mobile view.", {
      isActingOnBehalf,
      hasPermission,
      hasWritePermission,
      isAddCompOpen, // Include isAddCompOpen in dependencies for icon change
    });

    const mobileTabs = [];

    if (!isActingOnBehalf) {
      mobileTabs.push(
        { value: "home", label: "Diary", icon: Home },
        { value: "reports", label: "Reports", icon: BarChart3 },
        {
          value: "Add",
          label: "Add",
          icon: isAddCompOpen ? X : Home, // Dynamic icon based on state
        },
        { value: "settings", label: "Settings", icon: SettingsIcon },
      );
    } else {
      if (hasWritePermission("calorie")) {
        mobileTabs.push({ value: "home", label: "Diary", icon: Home });
      }
      if (hasWritePermission("checkin")) {
        mobileTabs.push({
          value: "checkin",
          label: "Check-In",
          icon: Activity,
        });
      }
      if (hasPermission("reports")) {
        mobileTabs.push({
          value: "reports",
          label: "Reports",
          icon: BarChart3,
        });
      }
    }

    if (user?.role === "admin") {
      mobileTabs.push({
        value: "admin",
        label: "Admin",
        icon: Shield,
      });
    }

    info(
      loggingLevel,
      "Index: Available tabs calculated in mobile view:",
      mobileTabs.map((tab) => tab.value),
    );
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
        { value: "home", label: "Diary", icon: Home },
        { value: "checkin", label: "Check-In", icon: Activity },
        { value: "reports", label: "Reports", icon: BarChart3 },
        { value: "foods", label: "Foods", icon: Utensils },
        { value: "exercises", label: "Exercises", icon: Dumbbell },
        { value: "goals", label: "Goals", icon: Target },
        { value: "settings", label: "Settings", icon: SettingsIcon },
      );
    } else {
      if (hasWritePermission("calorie")) {
        tabs.push({ value: "home", label: "Diary", icon: Home });
      }
      if (hasWritePermission("checkin")) {
        tabs.push({ value: "checkin", label: "Check-In", icon: Activity });
      }
      if (hasPermission("reports")) {
        tabs.push({ value: "reports", label: "Reports", icon: BarChart3 });
      }
    }

    if (user?.role === "admin") {
      tabs.push({
        value: "admin",
        label: "Admin",
        icon: Shield,
      });
    }

    info(
      loggingLevel,
      "Index: Available tabs calculated:",
      tabs.map((tab) => tab.value),
    );
    return tabs;
  }, [
    isActingOnBehalf,
    hasPermission,
    hasWritePermission,
    loggingLevel,
    user?.role,
  ]);

  // Set the active tab to "home" (Diary) by default, or the first available tab if "home" is not available
  useEffect(() => {
    debug(
      loggingLevel,
      "Index: availableTabs or activeTab useEffect triggered.",
      { availableTabs, activeTab },
    );
    if (user && availableTabs.length > 0 && !activeTab) {
      info(
        loggingLevel,
        "Index: Setting initial active tab to 'home' (Diary) for logged-in user.",
      );
      setActiveTab("home");
    } else if (availableTabs.length === 0 && activeTab) {
      warn(loggingLevel, "Index: No available tabs, clearing active tab.");
      setActiveTab("");
    }
  }, [availableTabs, activeTab, loggingLevel]);

  useEffect(() => {
    debug(
      loggingLevel,
      "Index: availableMobileTabs or activeTab useEffect triggered.",
      { availableMobileTabs, activeTab },
    );
    if (user && availableMobileTabs.length > 0 && !activeTab) {
      info(
        loggingLevel,
        "Index: Setting initial active tab to 'home' (Diary) for logged-in user on mobile.",
      );
      setActiveTab("home");
    } else if (availableMobileTabs.length === 0 && activeTab) {
      warn(
        loggingLevel,
        "Index: No available tabs, clearing active tab on mobile.",
      );
      setActiveTab("");
    }
  }, [availableMobileTabs, activeTab, loggingLevel]);

  // Handler for navigation from AddComp
  const handleNavigateFromAddComp = useCallback(
    (value: string) => {
      info(loggingLevel, `Index: Navigating to ${value} from AddComp.`);
      setActiveTab(value);
      setIsAddCompOpen(false); // Close the semicircle after navigating
    },
    [loggingLevel],
  );

  // Get the appropriate grid class based on the number of tabs
  const getGridClass = (count: number) => {
    debug(loggingLevel, "Index: Getting grid class for tab count:", count);
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

  debug(loggingLevel, "Index: Calculated grid class:", gridClass);

  info(
    loggingLevel,
    "Index: User logged in, rendering main application layout.",
  );
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {/* Header with logo, title, profile switcher, welcome message, theme toggle, and sign out button */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <img
              src="/images/SparkyFitness.png"
              alt="SparkyFitness Logo"
              className="h-12 w-auto"
            />
            <h1 className="text-xl sm:text-2xl font-bold text-foreground dark:text-slate-300">
              SparkyFitness
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Compact Profile Switcher */}
            <ProfileSwitcher />

            {/* Welcome Message */}
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
              setIsAddCompOpen((prev) => !prev); // Toggle the state
              // Do NOT set activeTab, keep current tab active
            } else {
              debug(loggingLevel, "Index: Tab changed to:", value);
              setIsAddCompOpen(false); // Close AddComp when another tab is selected
              setActiveTab(value);
            }
          }}
          className="space-y-6"
        >
          {/* Desktop/Tablet Navigation */}
          <TabsList className={`hidden sm:grid w-full gap-1 ${gridClass}`}>
            {availableTabs.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-900"
              >
                <Icon className="h-4 w-4" />
                <span>{label} </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Mobile Navigation - Increased icon sizes */}
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
            {/* Render all possible TabsContent components, and let activeTab control visibility */}
            <TabsContent value="home" className="space-y-6">
              <FoodDiary
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                refreshTrigger={foodDiaryRefreshTrigger}
                initialExercisesToLog={exercisesToLogFromPreset}
                onExercisesLogged={() => setExercisesToLogFromPreset(undefined)} // Clear after logging
              />
            </TabsContent>
            <TabsContent value="checkin" className="space-y-6">
              <CheckIn />
            </TabsContent>
            <TabsContent value="reports" className="space-y-6">
              <Reports />
            </TabsContent>
            <TabsContent value="foods" className="space-y-6">
              <FoodDatabaseManager />
            </TabsContent>
            <TabsContent value="exercises" className="space-y-6">
              <ExerciseDatabaseManager onPresetExercisesSelected={setExercisesToLogFromPreset} />
            </TabsContent>
            <TabsContent value="goals" className="space-y-6">
              <GoalsSettings />
            </TabsContent>
            <TabsContent value="settings" className="space-y-6">
              <Settings onShowAboutDialog={onShowAboutDialog} />
            </TabsContent>
            {user?.role === "admin" && (
              <TabsContent value="admin" className="space-y-6">
                {/* Admin sub-navigation or direct content */}
                <div className="flex flex-col space-y-4">
                  <AuthenticationSettings />
                  <BackupSettings />
                  <UserManagement />
                </div>
              </TabsContent>
            )}
            {/* The "Add" tab does not have a content component */}
          </div>
        </Tabs>

        {/* Sparky AI Chat Popup */}
        <SparkyChat />
      </div>
      {/* Footer with Version Info */}

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
