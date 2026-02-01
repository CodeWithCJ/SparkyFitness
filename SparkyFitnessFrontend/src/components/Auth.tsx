import { useState, useEffect, useRef } from "react";
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
import { Zap, Loader2, Fingerprint } from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, warn, error } from "@/utils/logging";
import { authClient } from "@/lib/auth-client";
import {
  registerUser,
  loginUser,
  initiateOidcLogin,
  getOidcProviders,
  getLoginSettings,
  verifyMagicLink,
  requestMagicLink,
} from "@/services/authService";
import { useAuth } from "@/hooks/useAuth";
import { AuthResponse, LoginSettings, OidcProvider } from "../types/auth";
import useToggle from "@/hooks/use-toggle";
import PasswordToggle from "./PasswordToggle";
import MfaChallenge from "../pages/MfaChallenge"; // Import the MfaChallenge component

const Auth = () => {
  const navigate = useNavigate();
  const { loggingLevel } = usePreferences();
  const { signIn, user: authUser, loading: authLoading } = useAuth();
  debug(loggingLevel, "Auth: Component rendered.");

  // Debugging Mount/Unmount
  useEffect(() => {
    // console.log("DEBUG: Auth.tsx MOUNTED");
    // return () => console.log("DEBUG: Auth.tsx UNMOUNTED");
  }, []);

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
  // State for MFA challenge
  const [showMfaChallenge, setShowMfaChallenge] = useState(false);
  const [mfaChallengeProps, setMfaChallengeProps] = useState<any>(null); // Store MFA data
  // State for Magic Link Request Dialog
  const [isMagicLinkRequestDialogOpen, setIsMagicLinkRequestDialogOpen] = useState(false);

  useEffect(() => {
    const fetchAuthSettings = async () => {
      // PREVENT AUTO-REDIRECT: If we already have a user or are still loading auth status
      if (authUser || authLoading) {
        console.log("Auth Page: Guard triggered - user session already active or loading.");
        return;
      }

      try {
        const settings = await getLoginSettings();
        setLoginSettings(settings);

        if (settings.oidc.enabled) {
          const providers = await getOidcProviders();
          setOidcProviders(providers);

          // AUTO-REDIRECT LOGIC: Only when email is disabled and exactly 1 OIDC provider is active
          if (!settings.email.enabled && providers.length === 1 && !authUser && !authLoading) {
            console.log("Auth Page: Auto-redirecting to OIDC provider:", providers[0].id);
            // Safety timeout to catch any late-arriving sessions
            const timer = setTimeout(() => {
              if (!authUser) {
                initiateOidcLogin(providers[0].id, providers[0].auto_register);
              }
            }, 800);
            return () => clearTimeout(timer);
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
  }, [loggingLevel, authUser, authLoading]);

  // Passkey Conditional UI (Autofill)
  useEffect(() => {
    const initPasskeyAutofill = async () => {
      // @ts-ignore
      if (window.PublicKeyCredential && PublicKeyCredential.isConditionalMediationAvailable) {
        // @ts-ignore
        const isAvailable = await PublicKeyCredential.isConditionalMediationAvailable();
        if (isAvailable) {
          debug(loggingLevel, "Auth: Passkey Conditional UI available. Starting autofill prompt.");
          try {
            await authClient.signIn.passkey({
              autoFill: true,
              fetchOptions: {
                onSuccess() {
                  info(loggingLevel, "Auth: Passkey autofill successful.");
                  navigate("/");
                },
                onError(ctx) {
                  // Silently ignore "Authentication was not completed" which is usually a cancel/timeout
                  if (ctx.error.message?.includes("Authentication was not completed")) {
                    debug(loggingLevel, "Auth: Passkey autofill dismissed or timed out.");
                    return;
                  }
                  error(loggingLevel, "Auth: Passkey autofill error:", ctx.error);
                }
              }
            });
          } catch (err) {
            // Silently fail for autofill
            debug(loggingLevel, "Auth: Passkey autofill silently ignored or failed.");
          }
        }
      }
    };
    // Only attempt if not already logged in
    if (!authUser && !authLoading) {
      initPasskeyAutofill();
    }
  }, [authUser, authLoading, loggingLevel, navigate]);

  const triggerMfaChallenge = async (
    authResponse: AuthResponse,
    currentUserEmail: string,
    handlers: { onMfaSuccess: () => void; onMfaCancel: () => void }
  ) => {
    // Only show challenge if at least one factor is enabled or setup is required
    if (authResponse.mfa_totp_enabled || authResponse.mfa_email_enabled || authResponse.needs_mfa_setup) {
      info(loggingLevel, "Auth: MFA required. Displaying MFA challenge.");

      // Proactively fetch MFA factors if missing
      let mfaEmail = authResponse.mfa_email_enabled;
      let mfaTotp = authResponse.mfa_totp_enabled;
      const userEmail = authResponse.email || currentUserEmail;

      if (mfaEmail === undefined && userEmail) {
        try {
          const factorRes = await fetch(`/api/auth/mfa-factors?email=${encodeURIComponent(userEmail)}`);
          if (factorRes.ok) {
            const factors = await factorRes.json();
            mfaEmail = factors.mfa_email_enabled;
            mfaTotp = factors.mfa_totp_enabled;
          }
        } catch (e) {
          error(loggingLevel, "Auth: Failed to fetch MFA factors:", e);
        }
      }

      setMfaChallengeProps({
        userId: authResponse.userId,
        email: userEmail,
        mfaTotpEnabled: mfaTotp ?? true,
        mfaEmailEnabled: mfaEmail ?? false,
        needsMfaSetup: authResponse.needs_mfa_setup,
        mfaToken: authResponse.mfaToken,
        ...handlers,
      });
      setShowMfaChallenge(true);
      return true;
    }

    info(loggingLevel, "Auth: MFA requested but no factors enabled. Bypassing.");
    return false;
  };

  const hasAttemptedMagicLinkLogin = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magicLinkToken = params.get('token');
    const authError = params.get('error');
    const path = window.location.pathname;

    // Handle authentication errors from redirects
    if (authError) {
      const errorMsg = authError === 'signup disabled'
        ? "New registrations are currently disabled for this provider."
        : `Authentication failed: ${authError}`;

      toast({
        title: "Login Error",
        description: errorMsg,
        variant: "destructive",
      });
      // Clear the error from URL by redirecting to base path
      navigate('/');
    }

    if (path === '/login/magic-link' && magicLinkToken && !hasAttemptedMagicLinkLogin.current) {
      hasAttemptedMagicLinkLogin.current = true;
      info(loggingLevel, "Auth: Attempting magic link login.");
      setLoading(true);
      const handleMagicLinkLogin = async () => {
        try {
          const data: AuthResponse = await verifyMagicLink(magicLinkToken);

          if (data.status === 'MFA_REQUIRED') {
            const mfaShown = await triggerMfaChallenge(data, email, {
              onMfaSuccess: () => {
                setShowMfaChallenge(false);
                navigate('/');
              },
              onMfaCancel: () => {
                setShowMfaChallenge(false);
                setLoading(false);
                navigate('/'); // Redirect back to home page on cancel
              },
            });

            if (!mfaShown) {
              signIn(data.userId, data.userId, data.email || email, data.role || 'user', 'magic_link', true, data.fullName);
            }
          } else {
            info(loggingLevel, "Auth: Magic link login successful.");
            toast({
              title: "Success",
              description: "Logged in successfully via magic link!",
            });
            signIn(data.userId, data.userId, data.email || email, data.role || 'user', 'magic_link', true, data.fullName);
          }
        } catch (err: any) {
          error(loggingLevel, "Auth: Magic link login failed:", err);
          toast({
            title: "Error",
            description: err.message || "Magic link is invalid or has expired.",
            variant: "destructive",
          });
          window.location.replace('/'); // Force a full page reload to clear state
        } finally {
          setLoading(false);
        }
      };
      handleMagicLinkLogin();
    }
  }, [loggingLevel, navigate, signIn, email]); // Add email to dependencies if it's used in mfaChallengeProps and might change.

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
      signIn(data.userId, data.userId, email, data.role || 'user', 'password', true, fullName);
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

  const handleRequestMagicLink = async (dialogEmail: string) => {
    info(loggingLevel, "Auth: Attempting to request magic link.");
    setLoading(true);
    try {
      await requestMagicLink(dialogEmail);
      toast({
        title: "Magic Link Sent",
        description: "If an account with that email exists, a magic link has been sent to your inbox.",
      });
    } catch (err: any) {
      error(loggingLevel, "Auth: Request magic link failed:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to request magic link.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    info(loggingLevel, "Auth: Attempting sign in.");
    setLoading(true);

    try {
      const data: AuthResponse = await loginUser(email, password);

      if (data.status === 'MFA_REQUIRED' || data.twoFactorRedirect) {
        const mfaShown = await triggerMfaChallenge(data, email, {
          onMfaSuccess: () => {
            setLoading(true);
            // We don't hide the challenge explicitly to avoid flashing the login form
            navigate('/');
          },
          onMfaCancel: () => {
            setShowMfaChallenge(false);
            setLoading(false);
          },
        });

        if (mfaShown) return;
      }

      info(loggingLevel, "Auth: Sign in successful.");
      toast({
        title: "Success",
        description: "Logged in successfully!",
      });
      signIn(data.userId, data.userId, email, data.role || 'user', 'password', true, data.fullName);
    } catch (err: any) {
      error(loggingLevel, "Auth: Sign in failed:", err);
      toast({
        title: "Error",
        description: err.message || "An unexpected error occurred during sign in.",
        variant: "destructive",
      });
    }

    setLoading(false);
    debug(loggingLevel, "Auth: Sign in loading state set to false.");
  };

  const handlePasskeySignIn = async () => {
    info(loggingLevel, "Auth: Attempting Passkey sign-in.");
    setLoading(true);
    try {
      const { data, error } = await authClient.signIn.passkey();
      if (error) throw error;

      info(loggingLevel, "Auth: Passkey sign-in successful.");
      toast({ title: "Success", description: "Logged in with Passkey!" });
      navigate("/");
    } catch (err: any) {
      error(loggingLevel, "Auth: Passkey sign-in failed:", err);
      toast({
        title: "Passkey Error",
        description: err.message || "Failed to sign in with Passkey. Ensure your device supports it.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 animate-in fade-in zoom-in duration-300">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-6" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Almost there!</h2>
            <p className="text-muted-foreground animate-pulse text-sm">Securing your family dashboard...</p>
          </div>
        ) : showMfaChallenge ? (
          <MfaChallenge {...mfaChallengeProps} />
        ) : (
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
                          autoComplete="username webauthn"
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
                          autoComplete="current-password webauthn"
                        />
                        <PasswordToggle showPassword={showPassword} passwordToggleHandler={passwordToggleHandler} />
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
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          Or sign in with
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full bg-primary/5 hover:bg-primary/10 border-primary/20 flex items-center justify-center mb-2"
                      onClick={handlePasskeySignIn}
                      disabled={loading}
                    >
                      <Fingerprint className="h-4 w-4 mr-2 text-primary" /> Sign in with Passkey
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full dark:bg-gray-800 dark:hover:bg-gray-600 flex items-center justify-center mb-2"
                      onClick={() => setIsMagicLinkRequestDialogOpen(true)}
                    >
                      <Zap className="h-4 w-4 mr-2" /> Request Magic Link
                    </Button>
                    {loginSettings.oidc.enabled && (
                      <>
                        {oidcProviders.map((provider) => (
                          <Button
                            key={provider.id}
                            variant="outline"
                            className="w-full dark:bg-gray-800 dark:hover:bg-gray-600 flex items-center justify-center"
                            onClick={() => initiateOidcLogin(provider.id, provider.auto_register)}
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
                        <PasswordToggle showPassword={showPassword} passwordToggleHandler={passwordToggleHandler} />
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
        )}
      </div>
      <MagicLinkRequestDialog
        isOpen={isMagicLinkRequestDialogOpen}
        onClose={() => setIsMagicLinkRequestDialogOpen(false)}
        onRequest={handleRequestMagicLink}
        loading={loading}
        initialEmail={email} // Pass the email from the main Auth component
      />
    </>
  );
};

interface MagicLinkRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRequest: (email: string) => Promise<void>;
  loading: boolean;
  initialEmail?: string; // Add optional initialEmail prop
}

const MagicLinkRequestDialog: React.FC<MagicLinkRequestDialogProps> = ({
  isOpen,
  onClose,
  onRequest,
  loading,
  initialEmail, // Add initialEmail prop
}) => {
  const [email, setEmail] = useState(initialEmail || ""); // Use initialEmail for default value

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("MagicLinkRequestDialog: Sending magic link request for email:", email); // Add logging
    await onRequest(email);
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      setEmail(initialEmail || ""); // Reset email when dialog opens
    }
  }, [isOpen, initialEmail]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md p-6">
        <CardHeader>
          <CardTitle>Request Magic Link</CardTitle>
          <CardDescription>Enter your email to receive a magic link for login.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="magic-link-email">Email</Label>
              <Input
                id="magic-link-email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send Magic Link"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
