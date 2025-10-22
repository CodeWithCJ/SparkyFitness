import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Zap } from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, warn, error } from "@/utils/logging";
import {
  registerUser,
  loginUser,
  initiateOidcLogin,
  getOidcProviders,
  getLoginSettings,
} from "@/services/authService";
import { useAuth } from "@/hooks/useAuth";
import { AuthResponse, LoginSettings, OidcProvider } from "../types/auth";
import useToggle from "@/hooks/use-toggle";
import PasswordToggle from "./PasswordToggle";

const Auth = () => {
  const navigate = useNavigate(); // Initialize useNavigate
  const { loggingLevel } = usePreferences();
  const { signIn } = useAuth(); // Use the useAuth hook (no navigate argument needed here)
  debug(loggingLevel, "Auth: Component rendered.");

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loginSettings, setLoginSettings] = useState<LoginSettings>({
    email: { enabled: true },
    oidc: { enabled: false, providers: [] },
    warning: null,
  });
  const [oidcProviders, setOidcProviders] = useState<OidcProvider[]>([]);
  const { isToggled: showPassword, toggleHandler: passwordToggleHandler } = useToggle();

  useEffect(() => {
    const fetchAuthSettings = async () => {
      try {
        const settings = await getLoginSettings();
        setLoginSettings(settings);

        if (settings.oidc.enabled) {
          const providers = await getOidcProviders();
          setOidcProviders(providers);

          // If only OIDC is enabled and there is only one provider, redirect immediately
          if (!settings.email.enabled && providers.length === 1) {
            initiateOidcLogin(providers[0].id);
          }
        }
      } catch (err) {
        error(loggingLevel, "Auth: Failed to fetch login settings or OIDC providers:", err);
        setLoginSettings({
          email: { enabled: true },
          oidc: { enabled: false, providers: [] },
          warning: 'Could not load login settings from server. Defaulting to email login.'
        });
      }
    };
    fetchAuthSettings();
  }, [loggingLevel]);

  const validatePassword = (pwd: string) => {
    if (pwd.length < 6) {
      return "Password must be at least 6 characters long.";
    }
    if (!/[A-Z]/.test(pwd)) {
      return "Password must contain at least one uppercase letter.";
    }
    if (!/[a-z]/.test(pwd)) {
      return "Password must contain at least one lowercase letter.";
    }
    if (!/[0-9]/.test(pwd)) {
      return "Password must contain at least one number.";
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) {
      return "Password must contain at least one special character.";
    }
    return null; // No error
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    info(loggingLevel, "Auth: Attempting sign up.");

    const validationError = validatePassword(password);
    if (validationError) {
      setPasswordError(validationError);
      setLoading(false);
      return;
    } else {
      setPasswordError(null);
    }

    setLoading(true);

    try {
      const data: any = await registerUser(email, password, fullName);
      info(loggingLevel, "Auth: Sign up successful.");
      toast({
        title: "Success",
        description: "Account created successfully!",
      });
      signIn(data.userId, email, data.token, data.role, 'password'); // Pass token, role, and authType to signIn
    } catch (err: any) {
      error(loggingLevel, "Auth: Sign up failed:", err);
      toast({
        title: "Error",
        description:
          err.message || "An unexpected error occurred during sign up.",
        variant: "destructive",
      });
    }

    setLoading(false);
    debug(loggingLevel, "Auth: Sign up loading state set to false.");
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    info(loggingLevel, "Auth: Attempting sign in.");
    setLoading(true);

    try {
      const data: any = await loginUser(email, password);
      info(loggingLevel, "Auth: Sign in successful.");
      toast({
        title: "Success",
        description: "Logged in successfully!",
      });
      signIn(data.userId, email, data.token, data.role, 'password'); // Pass token, role, and authType to signIn
    } catch (err: any) {
      error(loggingLevel, "Auth: Sign in failed:", err);
      toast({
        title: "Error",
        description:
          err.message || "An unexpected error occurred during sign in.",
        variant: "destructive",
      });
    }

    setLoading(false);
    debug(loggingLevel, "Auth: Sign in loading state set to false.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md dark:bg-gray-">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <img
              src="/images/SparkyFitness.png"
              alt="SparkyFitness Logo"
              className="h-10 w-10 mr-2"
            />
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-300">
              SparkyFitness
            </CardTitle>
          </div>
          <CardDescription>
            Built for Families. Powered by AI. Track food, fitness, water, and
            health — together.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loginSettings.warning && (
            <div className="mb-4 p-3 rounded-md bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
              <p className="font-semibold">Warning</p>
              <p>{loginSettings.warning}</p>
            </div>
          )}
          {loginSettings.email.enabled ? (
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="signin"
                  onClick={() =>
                    debug(loggingLevel, "Auth: Switched to Sign In tab.")
                  }
                >
                  Sign In
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  onClick={() =>
                    debug(loggingLevel, "Auth: Switched to Sign Up tab.")
                  }
                >
                  Sign Up
                </TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => {
                      debug(loggingLevel, "Auth: Sign In email input changed.");
                      setEmail(e.target.value);
                    }}
                    required
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2 relative">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => {
                      debug(
                        loggingLevel,
                        "Auth: Sign In password input changed."
                      );
                      setPassword(e.target.value);
                    }}
                    required
                    autoComplete="current-password"
                  />
                    <PasswordToggle showPassword = {showPassword} passwordToggleHandler = {passwordToggleHandler} />
                </div>
                <div className="text-right text-sm">
                  <a
                    href="/forgot-password"
                    className="font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </a>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
                </form>
                {loginSettings.oidc.enabled && (
                  <>
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          Or continue with
                        </span>
                      </div>
                    </div>
                    {oidcProviders.map((provider) => (
                      <Button
                        key={provider.id}
                        variant="outline"
                        className="w-full dark:bg-gray-800 dark:hover:bg-gray-600 flex items-center justify-center"
                        onClick={() => initiateOidcLogin(provider.id)}
                      >
                        {provider.logo_url && (
                          <img src={provider.logo_url} alt={`${provider.display_name} logo`} className="h-5 w-5 mr-2" />
                        )}
                        {provider.display_name || "Sign In with OIDC"}
                      </Button>
                    ))}
                  </>
                )}
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(e) => {
                      debug(
                        loggingLevel,
                        "Auth: Sign Up full name input changed."
                      );
                      setFullName(e.target.value);
                    }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => {
                      debug(loggingLevel, "Auth: Sign Up email input changed.");
                      setEmail(e.target.value);
                    }}
                    required
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2 relative">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => {
                      debug(
                        loggingLevel,
                        "Auth: Sign Up password input changed."
                      );
                      setPassword(e.target.value);
                      setPasswordError(validatePassword(e.target.value));
                    }}
                    required
                    autoComplete="new-password"
                  />
                    <PasswordToggle showPassword = {showPassword} passwordToggleHandler = {passwordToggleHandler} />
                  {passwordError && (
                    <p className="text-red-500 text-sm">{passwordError}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !!passwordError}
                >
                  {loading ? "Creating account..." : "Sign Up"}
                </Button>
                </form>
              </TabsContent>
            </Tabs>
          ) : (
            <div>
              {loginSettings.oidc.enabled && oidcProviders.length > 0 ? (
                oidcProviders.map((provider) => (
                  <Button
                    key={provider.id}
                    variant="outline"
                    className="w-full dark:bg-gray-800 dark:hover:bg-gray-600 flex items-center justify-center"
                    onClick={() => initiateOidcLogin(provider.id)}
                  >
                    {provider.logo_url && (
                      <img src={provider.logo_url} alt={`${provider.display_name} logo`} className="h-5 w-5 mr-2" />
                    )}
                    {provider.display_name || "Sign In with OIDC"}
                  </Button>
                ))
              ) : (
                <p className="text-center text-red-500">
                  No login methods are currently enabled. Please contact an administrator.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
