import { useState, useEffect, useCallback } from 'react';
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
import { Zap, Loader2, Fingerprint, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info, error } from '@/utils/logging';
import { authClient } from '@/lib/auth-client';

import { useAuth } from '@/hooks/useAuth';
import useToggle from '@/hooks/use-toggle';
import PasswordToggle from '../../components/PasswordToggle';
import MfaChallenge, { MfaChallengeProps } from './MfaChallenge';
import {
  mfaFactorsOptions,
  useAuthSettings,
  useInitiateOidcLoginMutation,
  useLoginUserMutation,
  useRegisterUserMutation,
  useRequestMagicLinkMutation,
} from '@/hooks/Auth/useAuth';
import { MagicLinkRequestDialog } from './MagicLinkRequestDialog';
import { useQueryClient } from '@tanstack/react-query';
import { AuthResponse } from '@/types/auth';
import { useTranslation } from 'react-i18next';
import {
  PASSWORD_REQUIREMENT_DEFAULTS,
  getPasswordValidationIssue,
} from '@/utils/passwordValidation';

const Auth = () => {
  const { t } = useTranslation();
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
  const [mfaChallengeProps, setMfaChallengeProps] =
    useState<MfaChallengeProps>(); // Store MFA data
  // State for Magic Link Request Dialog
  const [isMagicLinkRequestDialogOpen, setIsMagicLinkRequestDialogOpen] =
    useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { data: loginSettings } = useAuthSettings();
  const { mutateAsync: loginUser } = useLoginUserMutation();
  const { mutateAsync: registerUser } = useRegisterUserMutation();
  const { mutateAsync: requestMagicLink } = useRequestMagicLinkMutation();
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
          if (!provider) {
            throw new Error('Provider undefined');
          }

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
              if (!authUser && provider.id) {
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
                onError(ctx: { error: { message?: string; name?: string } }) {
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
          } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
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

  const getLocalizedPasswordError = (pwd: string) => {
    const issue = getPasswordValidationIssue(pwd);
    return issue
      ? t(
          `auth.passwordRequirements.${issue}`,
          PASSWORD_REQUIREMENT_DEFAULTS[issue]
        )
      : null;
  };

  const handleSignUp = async (e: React.SubmitEvent) => {
    e.preventDefault();
    info(loggingLevel, 'Auth: Attempting sign up.');

    const validationError = getLocalizedPasswordError(password);
    if (validationError) {
      setPasswordError(validationError);
      setLoading(false);
      return;
    } else {
      setPasswordError(null);
    }

    setLoading(true);

    const data: AuthResponse = await registerUser({
      email,
      password,
      fullName,
    });
    info(loggingLevel, 'Auth: Sign up successful.');
    signIn(
      data.userId,
      data.userId,
      email,
      data.role || 'user',
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

  const handleSignIn = async (e: React.SubmitEvent) => {
    e.preventDefault();
    info(loggingLevel, 'Auth: Attempting sign in.');
    setLoading(true);

    try {
      setFormError(null);
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
        true,
        data.fullName
      );
    } catch (err: unknown) {
      error(loggingLevel, 'Auth: Sign in failed:', err);
      setFormError(
        t(
          'auth.errors.signInFailed',
          'We could not sign you in. Check your details and try again.'
        )
      );
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
      toast({
        title: t('auth.passkey.successTitle', 'Signed in'),
        description: t(
          'auth.passkey.successDescription',
          'You signed in with your passkey.'
        ),
      });
      navigate('/');
    } catch (err: unknown) {
      error(loggingLevel, 'Auth: Passkey sign-in failed:', err);
      toast({
        title: t('auth.passkey.errorTitle', 'Passkey sign-in failed'),
        description: t(
          'auth.passkey.errorDescription',
          'Try again or use another sign-in method.'
        ),
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
              {t('auth.loading.title', 'Signing you in securely')}
            </h2>
            <p className="text-muted-foreground animate-pulse text-sm">
              {t('auth.loading.description', 'This should only take a moment.')}
            </p>
          </div>
        ) : showMfaChallenge && mfaChallengeProps ? (
          <MfaChallenge {...mfaChallengeProps} />
        ) : (
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                <img
                  src="/images/SparkyFitness.webp"
                  alt={t('auth.logoAlt', 'SparkyFitness logo')}
                  className="h-10 w-10 me-2"
                />
                <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-300">
                  SparkyFitness
                </CardTitle>
              </div>
              <CardDescription>
                {t(
                  'auth.tagline',
                  'Track your nutrition, activity, hydration, and health in one place.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loginSettings?.warning && (
                <div className="mb-4 p-3 rounded-md bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
                  <p className="font-semibold">
                    {t('auth.warningTitle', 'Important notice')}
                  </p>
                  <p>{loginSettings.warning}</p>
                </div>
              )}
              {formError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>
                    {t('auth.authenticationFailed', 'Sign-in failed')}
                  </AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
              {loginSettings?.email.enabled ? (
                <Tabs defaultValue="signin" className="w-full">
                  {!loginSettings?.signup_disabled && (
                    <TabsList className="h-10 grid w-full grid-cols-2">
                      <TabsTrigger
                        value="signin"
                        onClick={() => {
                          setFormError(null);
                          debug(loggingLevel, 'Auth: Switched to Sign In tab.');
                        }}
                      >
                        {t('auth.signIn', 'Sign in')}
                      </TabsTrigger>
                      <TabsTrigger
                        value="signup"
                        onClick={() => {
                          setFormError(null);
                          debug(loggingLevel, 'Auth: Switched to Sign Up tab.');
                        }}
                      >
                        {t('auth.createAccount', 'Create account')}
                      </TabsTrigger>
                    </TabsList>
                  )}
                  {loginSettings?.signup_disabled && (
                    <p className="text-center text-xs text-muted-foreground">
                      {t(
                        'auth.registrationDisabled',
                        'New account registration is currently unavailable.'
                      )}
                    </p>
                  )}
                  <TabsContent value="signin">
                    <form onSubmit={handleSignIn} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="signin-email">
                          {t('auth.email', 'Email')}
                        </Label>
                        <Input
                          id="signin-email"
                          type="email"
                          placeholder={t(
                            'auth.emailPlaceholder',
                            'name@example.com'
                          )}
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
                        <Label htmlFor="signin-password">
                          {t('auth.password', 'Password')}
                        </Label>
                        <Input
                          id="signin-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder={t(
                            'auth.passwordPlaceholder',
                            'Enter your password'
                          )}
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
                      <div className="text-end text-sm">
                        <a
                          href="/forgot-password"
                          className="font-medium text-primary hover:underline"
                        >
                          {t('auth.forgotPassword', 'Forgot your password?')}
                        </a>
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={loading}
                      >
                        {loading
                          ? t('auth.signingIn', 'Signing in…')
                          : t('auth.signIn', 'Sign in')}
                      </Button>
                    </form>
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          {t('auth.orSignInWith', 'Or continue with')}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full bg-primary/5 hover:bg-primary/10 border-primary/20 flex items-center justify-center mb-2"
                      onClick={handlePasskeySignIn}
                      disabled={loading}
                    >
                      <Fingerprint className="h-4 w-4 me-2 text-primary" />
                      {t('auth.signInWithPasskey', 'Sign in with a passkey')}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full dark:bg-gray-800 dark:hover:bg-gray-600 flex items-center justify-center mb-2"
                      onClick={() => setIsMagicLinkRequestDialogOpen(true)}
                    >
                      <Zap className="h-4 w-4 me-2" />
                      {t('auth.requestMagicLink', 'Email me a sign-in link')}
                    </Button>
                    {loginSettings?.oidc.enabled && (
                      <>
                        {loginSettings.oidc.providers?.map((provider) => (
                          <Button
                            key={provider.id}
                            variant="outline"
                            className="w-full dark:bg-gray-800 dark:hover:bg-gray-600 flex items-center justify-center"
                            onClick={() => {
                              if (provider.id) {
                                initiateOidcLogin({
                                  providerId: provider.id,
                                  requestSignUp: provider.auto_register,
                                });
                              }
                            }}
                          >
                            {provider.logo_url && (
                              <img
                                src={provider.logo_url}
                                alt={t('auth.providerLogoAlt', {
                                  provider: provider.display_name,
                                  defaultValue: '{{provider}} logo',
                                })}
                                className="h-5 w-5 me-2"
                              />
                            )}
                            {provider.display_name ||
                              t('auth.signInWithProvider', 'Sign in with SSO')}
                          </Button>
                        ))}
                      </>
                    )}
                  </TabsContent>

                  {!loginSettings?.signup_disabled && (
                    <TabsContent value="signup">
                      <form onSubmit={handleSignUp} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="signup-name">
                            {t('auth.fullName', 'Full name')}
                          </Label>
                          <Input
                            id="signup-name"
                            type="text"
                            placeholder={t(
                              'auth.fullNamePlaceholder',
                              'Enter your full name'
                            )}
                            value={fullName}
                            onChange={(e) => {
                              debug(
                                loggingLevel,
                                'Auth: Sign Up full name input changed.'
                              );
                              setFullName(e.target.value);
                            }}
                            autoComplete="name"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="signup-email">
                            {t('auth.email', 'Email')}
                          </Label>
                          <Input
                            id="signup-email"
                            type="email"
                            placeholder={t(
                              'auth.emailPlaceholder',
                              'name@example.com'
                            )}
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
                          <Label htmlFor="signup-password">
                            {t('auth.password', 'Password')}
                          </Label>
                          <Input
                            id="signup-password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder={t(
                              'auth.createPasswordPlaceholder',
                              'Create a password'
                            )}
                            value={password}
                            onChange={(e) => {
                              debug(
                                loggingLevel,
                                'Auth: Sign Up password input changed.'
                              );
                              setPassword(e.target.value);
                              setPasswordError(
                                getLocalizedPasswordError(e.target.value)
                              );
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
                          {loading
                            ? t('auth.creatingAccount', 'Creating account…')
                            : t('auth.createAccount', 'Create account')}
                        </Button>
                      </form>
                    </TabsContent>
                  )}
                </Tabs>
              ) : (
                <div className="space-y-4">
                  {/* Passkey is always available */}
                  <Button
                    variant="outline"
                    className="w-full dark:bg-gray-800 dark:hover:bg-gray-600 flex items-center justify-center"
                    onClick={handlePasskeySignIn}
                    disabled={loading}
                  >
                    <Fingerprint className="h-4 w-4 me-2 text-primary" />
                    {t('auth.signInWithPasskey', 'Sign in with a passkey')}
                  </Button>

                  {loginSettings?.oidc?.enabled &&
                    loginSettings.oidc.providers?.length > 0 && (
                      <>
                        <div className="flex items-center my-4">
                          <div className="flex-grow border-t border-gray-300 dark:border-gray-700"></div>
                          <span className="flex-shrink mx-4 text-gray-400 text-xs uppercase">
                            {t('auth.orSignInWith', 'Or continue with')}
                          </span>
                          <div className="flex-grow border-t border-gray-300 dark:border-gray-700"></div>
                        </div>
                        <div className="space-y-2">
                          {loginSettings.oidc.providers.map((provider) => (
                            <Button
                              key={provider.id}
                              variant="outline"
                              className="w-full dark:bg-gray-800 dark:hover:bg-gray-600 flex items-center justify-center"
                              onClick={() => {
                                if (provider.id) {
                                  initiateOidcLogin({
                                    providerId: provider.id,
                                  });
                                }
                              }}
                            >
                              {provider.logo_url && (
                                <img
                                  src={provider.logo_url}
                                  alt={t('auth.providerLogoAlt', {
                                    provider: provider.display_name,
                                    defaultValue: '{{provider}} logo',
                                  })}
                                  className="h-5 w-5 me-2"
                                />
                              )}
                              {provider.display_name ||
                                t(
                                  'auth.signInWithProvider',
                                  'Sign in with SSO'
                                )}
                            </Button>
                          ))}
                        </div>
                      </>
                    )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      {isMagicLinkRequestDialogOpen && (
        <MagicLinkRequestDialog
          onClose={() => setIsMagicLinkRequestDialogOpen(false)}
          onRequest={handleRequestMagicLink}
          loading={loading}
          initialEmail={email}
        />
      )}
    </>
  );
};

export default Auth;
