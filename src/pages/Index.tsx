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
import Reports from "@/components/Reports";
import CheckIn from "@/components/CheckIn";
import Settings from "@/components/Settings";
import GoalsSettings from "@/components/GoalsSettings"; // Import GoalsSettings
import ThemeToggle from "@/components/ThemeToggle";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import { useAuth } from "@/hooks/useAuth";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import {
  Home,
  Activity,
  BarChart3,
  Utensils,
  Settings as SettingsIcon,
  LogOut,
  Dumbbell,
  Target,
  Shield,
} from "lucide-react"; // Import Target and Shield icons
import { toast } from "@/hooks/use-toast";
import AuthenticationSettings from "@/pages/Admin/AuthenticationSettings"; // Import AuthenticationSettings
import axios from "axios"; // Import axios

import { API_BASE_URL } from "@/services/api";
interface IndexProps {
  onShowAboutDialog: () => void;
}

const Index: React.FC<IndexProps> = ({ onShowAboutDialog }) => {
  const { user, signOut, loading } = useAuth(); // Destructure loading from useAuth
  const {
    isActingOnBehalf,
    hasPermission,
    hasWritePermission,
    activeUserName,
  } = useActiveUser();
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, "Index: Component rendered.");

  const [appVersion, setAppVersion] = useState("Loading..."); // State for app version

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
  const [foodDiaryRefreshTrigger, setFoodDiaryRefreshTrigger] = useState(0); // New state for FoodDiary refresh

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
      await signOut(); // Call the signOut function from useAuth
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

  // Get display name for welcome message
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const fetchDisplayName = async () => {
      if (!loading && user?.id) {
        // Only fetch if not loading and user is available
        try {
          const profile = await apiCall(`/auth/profiles`, {
            suppress404Toast: true,
          });
          setDisplayName(profile?.full_name || user.email || ""); // Handle null profile
        } catch (err) {
          // If it's a 404, it means no profile is found, which is a valid scenario.
          // We set display name to user's email or empty string.
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
        // If loading is false and no user, clear display name
        setDisplayName("");
      }
    };
    fetchDisplayName();
  }, [user, loading, loggingLevel]); // Add loading to dependency array

  // Memoize available tabs to prevent hook order violations
  const availableTabs = useMemo(() => {
    debug(loggingLevel, "Index: Calculating available tabs.", {
      isActingOnBehalf,
      hasPermission,
      hasWritePermission,
    });

    const tabs = [];

    if (!isActingOnBehalf) {
      // User viewing their own profile - show all tabs excluding measurements
      debug(loggingLevel, "Index: User viewing own profile, showing all tabs.");
      tabs.push(
        { value: "home", label: "Diary", icon: Home, component: FoodDiary },
        {
          value: "checkin",
          label: "Check-In",
          icon: Activity,
          component: CheckIn,
        },
        {
          value: "reports",
          label: "Reports",
          icon: BarChart3,
          component: Reports,
        },
        {
          value: "foods",
          label: "Foods",
          icon: Utensils,
          component: FoodDatabaseManager,
        },
        {
          value: "exercises",
          label: "Exercises",
          icon: Dumbbell,
          component: ExerciseDatabaseManager,
        },
        {
          value: "goals",
          label: "Goals",
          icon: Target,
          component: GoalsSettings,
        }, // New Goals tab
        {
          value: "settings",
          label: "Settings",
          icon: SettingsIcon,
          component: Settings,
        },
      );
    } else {
      // User acting on behalf of someone else - filter by permissions
      debug(
        loggingLevel,
        "Index: User acting on behalf, filtering tabs by permissions.",
      );

      // Only show tabs if user has write permission (direct permission)
      if (hasWritePermission("calorie")) {
        debug(
          loggingLevel,
          "Index: User has calorie write permission, adding Diary tab.",
        );
        tabs.push({
          value: "home",
          label: "Diary",
          icon: Home,
          component: FoodDiary,
        });
      }

      if (hasWritePermission("checkin")) {
        debug(
          loggingLevel,
          "Index: User has checkin write permission, adding Check-In tab.",
        );
        tabs.push({
          value: "checkin",
          label: "Check-In",
          icon: Activity,
          component: CheckIn,
        });
      }

      // Reports tab shows if user has reports permission (read or write)
      if (hasPermission("reports")) {
        debug(
          loggingLevel,
          "Index: User has reports permission, adding Reports tab.",
        );
        tabs.push({
          value: "reports",
          label: "Reports",
          icon: BarChart3,
          component: Reports,
        });
      }
    }

    // Add Admin tab if user is an admin
    if (user?.role === "admin") {
      debug(loggingLevel, "Index: User is admin, adding Admin tab.");
      tabs.push({
        value: "admin",
        label: "Admin",
        icon: Shield,
        component: AuthenticationSettings,
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
      // Only set default if no active tab is selected and user is logged in
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
        return "grid-cols-8"; // Added for Admin tab
      default:
        return "grid-cols-7";
    }
  };

  const gridClass = getGridClass(availableTabs.length);
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
            debug(loggingLevel, "Index: Tab changed to:", value);
            setActiveTab(value);
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
            className={`grid w-full gap-1 fixed bottom-0 left-0 right-0 sm:hidden bg-background border-t py-2 px-2 h-14 z-50 ${gridClass}`}
          >
            {availableTabs.map(({ value, label, icon: Icon }) => (
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
            {availableTabs.map(({ value, component: Component }) => (
              <TabsContent key={value} value={value} className="space-y-6">
                {value === "home" ? (
                  <Component
                    selectedDate={selectedDate}
                    onDateChange={setSelectedDate}
                    refreshTrigger={foodDiaryRefreshTrigger} // Pass the new refresh trigger
                  />
                ) : value === "settings" ? (
                  <Component onShowAboutDialog={onShowAboutDialog} />
                ) : (
                  <Component />
                )}
              </TabsContent>
            ))}
          </div>
        </Tabs>

        {/* Sparky AI Chat Popup */}
        <SparkyChat />
      </div>
      {/* Footer with Version Info */}
      <footer className="hidden sm:block text-center text-muted-foreground text-sm py-4">
        <p className="cursor-pointer underline" onClick={onShowAboutDialog}>
          SparkyFitness v{appVersion}
        </p>
      </footer>
    </div>
  );
};

export default Index;
