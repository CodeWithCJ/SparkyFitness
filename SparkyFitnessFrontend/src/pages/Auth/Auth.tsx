import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Zap, Loader2, Fingerprint } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info, error } from '@/utils/logging';
import { authClient } from '@/lib/auth-client';

import { useAuth } from '@/hooks/useAuth';
import useToggle from '@/hooks/use-toggle';
import PasswordToggle from '../../components/PasswordToggle';
import MfaChallenge from './MfaChallenge';
import {
  mfaFactorsOptions,
  useAuthSettings,
  useInitiateOidcLoginMutation,
  useLoginUserMutation,
  useRegisterUserMutation,
  useRequestMagicLinkMutation,
  useVerifyMagicLinkMutation,
} from '@/hooks/Auth/useAuth';
import { MagicLinkRequestDialog } from './MagicLinkRequestDialog';
import { useQueryClient } from '@tanstack/react-query';
import { AuthResponse } from '@/types/auth';

const Auth = () => {
  const navigate = useNavigate();
  const { loggingLevel } = usePreferences();
  const { signIn, user: authUser, loading: authLoading } = useAuth();
  debug(loggingLevel, 'Auth: Component rendered.');

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const { isToggled: showPassword, toggleHandler: passwordToggleHandler } =
    useToggle();
  // State for MFA challenge
  const [showMfaChallenge, setShowMfaChallenge] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [mfaChallengeProps, setMfaChallengeProps] = useState<any>(null); // Store MFA data
  // State for Magic Link Request Dialog
  const [isMagicLinkRequestDialogOpen, setIsMagicLinkRequestDialogOpen] =
    useState(false);

  const queryClient = useQueryClient();
  const { data: loginSettings } = useAuthSettings();
  const { mutateAsync: loginUser } = useLoginUserMutation();
  const { mutateAsync: registerUser } = useRegisterUserMutation();
  const { mutateAsync: requestMagicLink } = useRequestMagicLinkMutation();
  const { mutateAsync: verifyMagicLink } = useVerifyMagicLinkMutation();
  const { mutateAsync: initiateOidcLogin } = useInitiateOidcLoginMutation();

  useEffect(() => {
    const fetchAuthSettings = async () => {
      // PREVENT AUTO-REDIRECT: If we already have a user or are still loading auth status
      if (authUser || authLoading) {
        if (authUser) {
          navigate('/');
        }
        return;
      }

      try {
        if (
          loginSettings &&
          loginSettings.oidc.providers.length === 1 &&
          loginSettings.oidc.enabled
        ) {
          const provider = loginSettings.oidc.providers[0];

          // AUTO-REDIRECT LOGIC: Only when email is disabled, auto_redirect is enabled (e.g. SPARKY_FITNESS_OIDC_AUTO_REDIRECT), and exactly 1 OIDC provider is active
          if (
            loginSettings.oidc.auto_redirect &&
            !loginSettings.email.enabled &&
            !authUser &&
            !authLoading
          ) {
            console.log(
              'Auth Page: Auto-redirecting to OIDC provider:',
              provider.id
            );
            // Safety timeout to catch any late-arriving sessions
            const timer = setTimeout(() => {
              if (!authUser) {
                initiateOidcLogin({
                  providerId: provider.id,
                  requestSignUp: provider.auto_register,
                });
              }
            }, 800);
            return () => clearTimeout(timer);
          }
        }
      } catch (err) {
        error(
          loggingLevel,
          'Auth: Failed to fetch login settings or OIDC providers:',
          err
        );
      }
    };
    fetchAuthSettings();
  }, [
    loggingLevel,
    authUser,
    authLoading,
    navigate,
    loginSettings,
    initiateOidcLogin,
  ]);

  // Passkey Conditional UI (Autofill)
  useEffect(() => {
    const initPasskeyAutofill = async () => {
      if (
        window.PublicKeyCredential &&
        PublicKeyCredential.isConditionalMediationAvailable
      ) {
        const isAvailable =
          await PublicKeyCredential.isConditionalMediationAvailable();
        if (isAvailable) {
          debug(
            loggingLevel,
            'Auth: Passkey Conditional UI available. Starting autofill prompt.'
          );
          try {
            await authClient.signIn.passkey({
              autoFill: true,
              fetchOptions: {
                onSuccess() {
                  info(loggingLevel, 'Auth: Passkey autofill successful.');
                  navigate('/');
                },
                onError(ctx) {
                  // Silently ignore "Authentication was not completed" or AbortError
                  if (
                    ctx.error.message?.includes(
                      'Authentication was not completed'
                    ) ||
                    ctx.error.name === 'AbortError'
                  ) {
                    debug(
                      loggingLevel,
                      'Auth: Passkey autofill dismissed or interrupted.'
                    );
                    return;
                  }
                  error(
                    loggingLevel,
                    'Auth: Passkey autofill error:',
                    ctx.error
                  );
                },
              },
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } catch (err: any) {
            // Silently fail for autofill, especially for AbortError
            if (err.name === 'AbortError') {
              debug(loggingLevel, 'Auth: Passkey autofill aborted.');
            } else {
              debug(
                loggingLevel,
                'Auth: Passkey autofill silently ignored or failed.'
              );
            }
          }
        }
      }
    };
    // Only attempt if not already logged in
    if (!authUser && !authLoading) {
      initPasskeyAutofill();
    }
  }, [authUser, authLoading, loggingLevel, navigate]);

  const triggerMfaChallenge = useCallback(
    async (
      authResponse: AuthResponse,
      currentUserEmail: string,
      handlers: { onMfaSuccess: () => void; onMfaCancel: () => void }
    ) => {
      // CRITICAL: If twoFactorRedirect is true, we MUST show the challenge
      // Even if factor flags are missing, we default to showing the challenge
      const shouldShowChallenge =
        authResponse.mfa_totp_enabled ||
        authResponse.mfa_email_enabled ||
        authResponse.needs_mfa_setup ||
        authResponse.twoFactorRedirect;

      if (shouldShowChallenge) {
        info(loggingLevel, 'Auth: MFA required. Displaying MFA challenge.');

        // Proactively fetch MFA factors if missing
        let mfaEmail = authResponse.mfa_email_enabled;
        let mfaTotp = authResponse.mfa_totp_enabled;
        const userEmail = authResponse.email || currentUserEmail;

        if ((mfaEmail === undefined || mfaTotp === undefined) && userEmail) {
          try {
            const factors = await queryClient.fetchQuery(
              mfaFactorsOptions(userEmail)
            );
            mfaEmail = factors.mfa_email_enabled;
            mfaTotp = factors.mfa_totp_enabled;
          } catch (e) {
            error(loggingLevel, 'Auth: Failed to fetch MFA factors:', e);
            // Default to TOTP if we can't fetch factors but MFA is required
            mfaTotp = true;
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

      info(loggingLevel, 'Auth: MFA not required. Bypassing.');
      return false;
    },
    [loggingLevel, queryClient]
  );

  const hasAttemptedMagicLinkLogin = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magicLinkToken = params.get('token');
    const authError = params.get('error');
    const path = window.location.pathname;

    // Handle authentication errors from redirects
    if (authError) {
      const errorMsg =
        authError === 'signup disabled'
          ? 'New registrations are currently disabled for this provider.'
          : `Authentication failed: ${authError}`;

      toast({
        title: 'Login Error',
        description: errorMsg,
        variant: 'destructive',
      });
      // Clear the error from URL by redirecting to base path
      navigate('/');
    }

    if (
      path === '/login/magic-link' &&
      magicLinkToken &&
      !hasAttemptedMagicLinkLogin.current
    ) {
      hasAttemptedMagicLinkLogin.current = true;
      info(loggingLevel, 'Auth: Attempting magic link login.');
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
              signIn(
                data.userId,
                data.userId,
                data.email || email,
                data.role || 'user',
                'magic_link',
                true,
                data.fullName
              );
            }
          } else {
            info(loggingLevel, 'Auth: Magic link login successful.');
            toast({
              title: 'Success',
              description: 'Logged in successfully via magic link!',
            });
            signIn(
              data.userId,
              data.userId,
              data.email || email,
              data.role || 'user',
              'magic_link',
              true,
              data.fullName
            );
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
          error(loggingLevel, 'Auth: Magic link login failed:', err);
          toast({
            title: 'Error',
            description: err.message || 'Magic link is invalid or has expired.',
            variant: 'destructive',
          });
          window.location.replace('/'); // Force a full page reload to clear state
        } finally {
          setLoading(false);
        }
      };
      handleMagicLinkLogin();
    }
  }, [
    loggingLevel,
    navigate,
    signIn,
    email,
    triggerMfaChallenge,
    verifyMagicLink,
  ]);

  const validatePassword = (pwd: string) => {
    if (pwd.length < 6) {
      return 'Password must be at least 6 characters long.';
    }
    if (!/[A-Z]/.test(pwd)) {
      return 'Password must contain at least one uppercase letter.';
    }
    if (!/[a-z]/.test(pwd)) {
      return 'Password must contain at least one lowercase letter.';
    }
    if (!/[0-9]/.test(pwd)) {
      return 'Password must contain at least one number.';
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) {
      return 'Password must contain at least one special character.';
    }
    return null; // No error
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    info(loggingLevel, 'Auth: Attempting sign up.');

    const validationError = validatePassword(password);
    if (validationError) {
      setPasswordError(validationError);
      setLoading(false);
      return;
    } else {
      setPasswordError(null);
    }

    setLoading(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await registerUser({ email, password, fullName });
    info(loggingLevel, 'Auth: Sign up successful.');
    signIn(
      data.userId,
      data.userId,
      email,
      data.role || 'user',
      'password',
      true,
      fullName
    );

    setLoading(false);
    debug(loggingLevel, 'Auth: Sign up loading state set to false.');
  };

  const handleRequestMagicLink = async (dialogEmail: string) => {
    info(loggingLevel, 'Auth: Attempting to request magic link.');
    setLoading(true);
    await requestMagicLink(dialogEmail);
    setLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    info(loggingLevel, 'Auth: Attempting sign in.');
    setLoading(true);

    try {
      const data: AuthResponse = await loginUser({ email, password });

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

        if (mfaShown) {
          setLoading(false); // CRITICAL: Allow MFA challenge to be visible
          return;
        }
      }

      info(loggingLevel, 'Auth: Sign in successful.');
      signIn(
        data.userId,
        data.userId,
        email,
        data.role || 'user',
        'password',
        true,
        data.fullName
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      error(loggingLevel, 'Auth: Sign in failed:', err);
    }

    setLoading(false);
    debug(loggingLevel, 'Auth: Sign in loading state set to false.');
  };

  const handlePasskeySignIn = async () => {
    info(loggingLevel, 'Auth: Attempting Passkey sign-in.');
    setLoading(true);
    try {
      const { error } = await authClient.signIn.passkey();
      if (error) throw error;

      info(loggingLevel, 'Auth: Passkey sign-in successful.');
      toast({ title: 'Success', description: 'Logged in with Passkey!' });
      navigate('/');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      error(loggingLevel, 'Auth: Passkey sign-in failed:', err);
      toast({
        title: 'Passkey Error',
        description:
          err.message ||
          'Failed to sign in with Passkey. Ensure your device supports it.',
        variant: 'destructive',
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
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Almost there!
            </h2>
            <p className="text-muted-foreground animate-pulse text-sm">
              Securing your family dashboard...
            </p>
          </div>
        ) : showMfaChallenge ? (
          <MfaChallenge {...mfaChallengeProps} />
        ) : (
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                <img
                  src="/images/SparkyFitness.webp"
                  alt="SparkyFitness Logo"
                  className="h-10 w-10 mr-2"
                />
                <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-300">
                  SparkyFitness
                </CardTitle>
              </div>
              <CardDescription>
                Built for Families. Powered by AI. Track food, fitness, water,
                and health — together.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loginSettings?.warning && (
                <div className="mb-4 p-3 rounded-md bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
                  <p className="font-semibold">Warning</p>
                  <p>{loginSettings.warning}</p>
                </div>
              )}
              {loginSettings?.email.enabled ? (
                <Tabs defaultValue="signin" className="w-full">
                  <TabsList className="h-10 grid w-full grid-cols-2">
                    <TabsTrigger
                      value="signin"
                      onClick={() =>
                        debug(loggingLevel, 'Auth: Switched to Sign In tab.')
                      }
                    >
                      Sign In
                    </TabsTrigger>
                    <TabsTrigger
                      value="signup"
                      onClick={() =>
                        debug(loggingLevel, 'Auth: Switched to Sign Up tab.')
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
                            debug(
                              loggingLevel,
                              'Auth: Sign In email input changed.'
                            );
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
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Enter your password"
                          value={password}
                          onChange={(e) => {
                            debug(
                              loggingLevel,
                              'Auth: Sign In password input changed.'
                            );
                            setPassword(e.target.value);
                          }}
                          required
                          autoComplete="current-password webauthn"
                        />
                        <PasswordToggle
                          showPassword={showPassword}
                          passwordToggleHandler={passwordToggleHandler}
                        />
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
                        {loading ? 'Signing in...' : 'Sign In'}
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
                      <Fingerprint className="h-4 w-4 mr-2 text-primary" /> Sign
                      in with Passkey
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full dark:bg-gray-800 dark:hover:bg-gray-600 flex items-center justify-center mb-2"
                      onClick={() => setIsMagicLinkRequestDialogOpen(true)}
                    >
                      <Zap className="h-4 w-4 mr-2" /> Request Magic Link
                    </Button>
                    {loginSettings?.oidc.enabled && (
                      <>
                        {loginSettings.oidc.providers?.map((provider) => (
                          <Button
                            key={provider.id}
                            variant="outline"
                            className="w-full dark:bg-gray-800 dark:hover:bg-gray-600 flex items-center justify-center"
                            onClick={() =>
                              initiateOidcLogin({
                                providerId: provider.id,
                                requestSignUp: provider.auto_register,
                              })
                            }
                          >
                            {provider.logo_url && (
                              <img
                                src={provider.logo_url}
                                alt={`${provider.display_name} logo`}
                                className="h-5 w-5 mr-2"
                              />
                            )}
                            {provider.display_name || 'Sign In with OIDC'}
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
                              'Auth: Sign Up full name input changed.'
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
                            debug(
                              loggingLevel,
                              'Auth: Sign Up email input changed.'
                            );
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
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Create a password"
                          value={password}
                          onChange={(e) => {
                            debug(
                              loggingLevel,
                              'Auth: Sign Up password input changed.'
                            );
                            setPassword(e.target.value);
                            setPasswordError(validatePassword(e.target.value));
                          }}
                          required
                          autoComplete="new-password"
                        />
                        <PasswordToggle
                          showPassword={showPassword}
                          passwordToggleHandler={passwordToggleHandler}
                        />
                        {passwordError && (
                          <p className="text-red-500 text-sm">
                            {passwordError}
                          </p>
                        )}
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={loading || !!passwordError}
                      >
                        {loading ? 'Creating account...' : 'Sign Up'}
                      </Button>
                    </form>
                  </TabsContent>
                </Tabs>
              ) : (
                <div>
                  {loginSettings?.oidc.enabled &&
                  loginSettings.oidc.providers?.length > 0 ? (
                    loginSettings.oidc.providers.map((provider) => (
                      <Button
                        key={provider.id}
                        variant="outline"
                        className="w-full dark:bg-gray-800 dark:hover:bg-gray-600 flex items-center justify-center"
                        onClick={() =>
                          initiateOidcLogin({ providerId: provider.id })
                        }
                      >
                        {provider.logo_url && (
                          <img
                            src={provider.logo_url}
                            alt={`${provider.display_name} logo`}
                            className="h-5 w-5 mr-2"
                          />
                        )}
                        {provider.display_name || 'Sign In with OIDC'}
                      </Button>
                    ))
                  ) : (
                    <p className="text-center text-red-500">
                      No login methods are currently enabled. Please contact an
                      administrator.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      <MagicLinkRequestDialog
        key={isMagicLinkRequestDialogOpen ? 'open' : 'closed'}
        onClose={() => setIsMagicLinkRequestDialogOpen(false)}
        onRequest={handleRequestMagicLink}
        loading={loading}
        initialEmail={email} // Pass the email from the main Auth component
      />
    </>
  );
};

export default Auth;
