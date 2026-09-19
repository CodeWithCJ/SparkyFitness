export interface AuthEnvOverrides {
  enable_email_password_login: boolean | null;
  is_oidc_active: true | null;
}

/** Null leaves the saved admin value in effect instead of forcing it off. */
export function getAuthEnvOverrides(env: NodeJS.ProcessEnv): AuthEnvOverrides {
  const forceEmailLogin = env.SPARKY_FITNESS_FORCE_EMAIL_LOGIN === 'true';
  const disableEmailLogin = env.SPARKY_FITNESS_DISABLE_EMAIL_LOGIN === 'true';

  return {
    enable_email_password_login: forceEmailLogin
      ? true
      : disableEmailLogin
        ? false
        : null,
    is_oidc_active:
      env.SPARKY_FITNESS_OIDC_AUTH_ENABLED === 'true' ? true : null,
  };
}
