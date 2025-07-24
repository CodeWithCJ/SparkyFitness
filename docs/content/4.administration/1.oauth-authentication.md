# OAuth Authentication (OpenID Connect)

SparkyFitness supports OpenID Connect (OIDC) for user authentication, allowing integration with various identity providers. This guide outlines how to configure OIDC within your SparkyFitness instance.

## Overview

SparkyFitness leverages the `openid-client` library to facilitate secure OIDC authentication. OIDC settings are stored in the database and can be managed via the application's administrative interface.

## Configuration Steps

To set up OIDC authentication, you will need to configure the following settings, typically found in the administration section of your SparkyFitness application:

1.  **Issuer URL**: The URL of your OIDC Identity Provider (IdP). This is where SparkyFitness will discover the IdP's configuration (e.g., `https://accounts.google.com`).
2.  **Client ID**: The unique identifier for your SparkyFitness application registered with the OIDC IdP.
3.  **Client Secret**: The secret key provided by your OIDC IdP for your SparkyFitness application. This should be kept confidential.
4.  **Redirect URI**: The URL where the OIDC IdP will redirect the user after authentication. For SparkyFitness, this is typically `${SPARKY_FITNESS_FRONTEND_URL}/oidc-callback`. Ensure this URI is registered with your OIDC IdP.
5.  **Auto-Register Users**: (Optional) If enabled, new users who successfully authenticate via OIDC but do not have an existing SparkyFitness account will be automatically registered.
6.  **Enable Email/Password Login**: (Optional) If OIDC is enabled, this setting determines whether traditional email/password login is still permitted.

### Advanced Settings (Optional)

Depending on your OIDC provider and security requirements, you might also configure:

*   **ID Token Signed Response Algorithm**: The algorithm used to sign the ID Token.
*   **Userinfo Signed Response Algorithm**: The algorithm used to sign the UserInfo response.
*   **Request Timeout**: Timeout for OIDC requests.

## OIDC Flow

When a user attempts to log in via OIDC:

1.  SparkyFitness redirects the user to the configured OIDC Identity Provider.
2.  The user authenticates with the IdP.
3.  Upon successful authentication, the IdP redirects the user back to the SparkyFitness `oidc-callback` endpoint with an authorization code.
4.  SparkyFitness exchanges the authorization code for an ID Token and Access Token with the IdP.
5.  User information is extracted from the ID Token and/or UserInfo endpoint.
6.  If auto-registration is enabled and the user is new, a new SparkyFitness account is created. Otherwise, the existing account is linked or the user is logged in.

## Troubleshooting

*   **Invalid Redirect URI**: Ensure the Redirect URI configured in SparkyFitness exactly matches the one registered with your OIDC Identity Provider.
*   **Incorrect Client ID/Secret**: Double-check that the Client ID and Client Secret are correct and match the values from your IdP.
*   **Issuer URL Issues**: Verify that the Issuer URL is correct and accessible from your SparkyFitness server.