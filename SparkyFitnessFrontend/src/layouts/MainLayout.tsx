import type React from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, Outlet, useNavigate } from "react-router-dom";
import { debug, info, error } from "@/utils/logging";
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
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import axios from "axios";

import SparkyChat from "../pages/Chat/SparkyChat";
import AddComp from "@/layouts/AddComp";
import ThemeToggle from "@/components/ThemeToggle";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import GitHubStarCounter from "@/components/GitHubStarCounter";
import GitHubSponsorButton from "@/components/GitHubSponsorButton";
import GlobalNotificationIcon from "@/components/GlobalNotificationIcon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useIsMobile } from "@/hooks/use-mobile";

interface AddCompItem {
  value: string;
  label: string;
  icon: LucideIcon;
}

interface MainLayoutProps {
  onShowAboutDialog: () => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({ onShowAboutDialog }) => {
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
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, "MainLayout: Component rendered.");

  const [appVersion, setAppVersion] = useState("Loading...");
  const [isAddCompOpen, setIsAddCompOpen] = useState(false);

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

  const handleSignOut = async () => {
    info(loggingLevel, "MainLayout: Attempting to sign out.");
    try {
      await signOut();
      toast({
        title: "Success",
        description: "Signed out successfully",
      });
      navigate("/login"); // Navigate to login page after sign out
    } catch (err) {
      error(loggingLevel, "MainLayout: Sign out error:", err);
      toast({
        title: "Error",
        description: "Failed to sign out",
        variant: "destructive",
      });
    }
  };

  const addCompItems: AddCompItem[] = useMemo(() => {
    const items: AddCompItem[] = [];
    if (!isActingOnBehalf) {
      items.push(
        { value: "checkin", label: "Check-In", icon: Activity },
        { value: "foods", label: "Foods", icon: Utensils },
        {
          value: "exercises",
          label: t("exercise.title", "Exercises"),
          icon: Dumbbell,
        },
        { value: "goals", label: "Goals", icon: Target },
      );
    } else {
      if (hasWritePermission("checkin")) {
        items.push({ value: "checkin", label: "Check-In", icon: Activity });
      }
    }
    return items;
  }, [isActingOnBehalf, hasWritePermission, t]);

  const availableTabs = useMemo(() => {
    debug(loggingLevel, "MainLayout: Calculating available tabs (desktop).", {
      isActingOnBehalf,
      hasPermission,
      hasWritePermission,
    });
    const tabs = [];
    if (!isActingOnBehalf) {
      tabs.push(
        { value: "/", label: t("nav.diary"), icon: Home },
        { value: "/checkin", label: t("nav.checkin"), icon: Activity },
        { value: "/reports", label: t("nav.reports"), icon: BarChart3 },
        { value: "/foods", label: t("nav.foods"), icon: Utensils },
        {
          value: "/exercises",
          label: t("exercise.title", "Exercises"),
          icon: Dumbbell,
        },
        { value: "/goals", label: t("nav.goals"), icon: Target },
        { value: "/settings", label: t("nav.settings"), icon: SettingsIcon },
      );
    } else {
      if (hasWritePermission("diary")) {
        tabs.push({ value: "/", label: t("nav.diary"), icon: Home });
      }
      if (hasWritePermission("checkin")) {
        tabs.push({
          value: "/checkin",
          label: t("nav.checkin"),
          icon: Activity,
        });
      }
      if (hasPermission("reports")) {
        tabs.push({
          value: "/reports",
          label: t("nav.reports"),
          icon: BarChart3,
        });
      }
    }
    if (user?.role === "admin" && !isActingOnBehalf) {
      tabs.push({ value: "/admin", label: t("nav.admin"), icon: Shield });
    }
    return tabs;
  }, [
    isActingOnBehalf,
    hasPermission,
    hasWritePermission,
    loggingLevel,
    user?.role,
    t,
  ]);

  const availableMobileTabs = useMemo(() => {
    debug(loggingLevel, "MainLayout: Calculating available tabs (mobile).", {
      isActingOnBehalf,
      hasPermission,
      hasWritePermission,
      isAddCompOpen,
    });
    const mobileTabs = [];
    if (!isActingOnBehalf) {
      mobileTabs.push(
        { value: "/", label: t("nav.diary"), icon: Home },
        { value: "/reports", label: t("nav.reports"), icon: BarChart3 },
        {
          value: "Add",
          label: t("common.add", "Add"),
          icon: isAddCompOpen ? X : Plus,
        },
        { value: "/settings", label: t("nav.settings"), icon: SettingsIcon },
      );
    } else {
      if (hasWritePermission("diary")) {
        mobileTabs.push({ value: "/", label: t("nav.diary"), icon: Home });
      }
      if (hasWritePermission("checkin")) {
        mobileTabs.push({
          value: "/checkin",
          label: t("nav.checkin"),
          icon: Activity,
        });
      }
      if (hasPermission("reports")) {
        mobileTabs.push({
          value: "/reports",
          label: t("nav.reports"),
          icon: BarChart3,
        });
      }
    }
    if (user?.role === "admin" && !isActingOnBehalf) {
      mobileTabs.push({ value: "/admin", label: t("nav.admin"), icon: Shield });
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
      navigate(value);
      setIsAddCompOpen(false);
    },
    [loggingLevel, navigate],
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

  const location = useLocation();

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
        <nav className={`hidden sm:grid w-full gap-1 ${gridClass} mb-6 bg-slate-200/60 dark:bg-muted/50 p-1 rounded-lg`}>
          {availableTabs.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant="ghost"
              className={`flex items-center gap-2 hover:bg-background/50 transition-all ${location.pathname === value
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground"
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
          className={`grid w-full gap-1 fixed bottom-0 left-0 right-0 sm:hidden bg-background border-t py-2 px-2 h-14 z-50 ${mobileGridClass}`}
        >
          {availableMobileTabs.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              variant="ghost"
              className={`flex flex-col items-center gap-1 py-2 ${location.pathname ===
                (value === "Add" ? location.pathname : value)
                ? "text-primary"
                : ""
                }`}
              onClick={() => {
                if (value === "Add") {
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
        </nav>

        <div className="pb-16 sm:pb-0">
          <Outlet />
        </div>

        <SparkyChat />
      </div>

      <AddComp
        isVisible={isAddCompOpen}
        onClose={() => setIsAddCompOpen(false)}
        items={addCompItems}
        onNavigate={handleNavigateFromAddComp}
      />

      <footer className="text-center text-muted-foreground text-sm py-4">
        {isMobile ? (
          <div className="flex flex-col items-center gap-2 mb-14">
            <div className="flex justify-center gap-2">
              <GitHubStarCounter owner="CodeWithCJ" repo="SparkyFitness" />
              <GitHubSponsorButton owner="CodeWithCJ" />
            </div>
            <p className="cursor-pointer underline" onClick={onShowAboutDialog}>
              SparkyFitness v{appVersion}
            </p>
          </div>
        ) : (
          <div className="flex justify-center items-center gap-4">
            <p className="cursor-pointer underline" onClick={onShowAboutDialog}>
              SparkyFitness v{appVersion}
            </p>
          </div>
        )}
      </footer>
    </div>
  );
};

export default MainLayout;
