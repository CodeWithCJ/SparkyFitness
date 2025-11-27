# Authentik Proxy Authentication - Nginx Configuration

This document provides the recommended Nginx configuration for SparkyFitness when using Authentik proxy authentication.

## Problem

When Authentik logs users out (default 24h session timeout), the frontend application loads but shows "Network load Error" instead of redirecting to the Authentik login page. This happens because:

1. The session expires on Authentik's side
2. User's browser makes requests to the app
3. Authentik proxy blocks the requests with 401/403
4. Frontend shows error instead of redirecting to login

## Solution

The solution involves two components:

### 1. Frontend Changes (Already Applied)

The frontend now properly handles 401/403 responses by:
- Detecting authentication failures
- Clearing local storage
- Redirecting to `/` which triggers Authentik to redirect to login

See: `SparkyFitnessFrontend/src/services/api.ts:91-113`

### 2. Nginx Proxy Manager Configuration

Use the following configuration in your Nginx Proxy Manager **Advanced** tab for your SparkyFitness proxy host:

```nginx
# Prevent all caching
proxy_no_cache 1;
proxy_cache_bypass 1;

# Response headers to prevent browser caching
proxy_hide_header Cache-Control;
proxy_hide_header Pragma;
proxy_hide_header Expires;
add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
add_header Pragma "no-cache" always;
add_header Expires "0" always;

# Disable service workers
add_header Clear-Site-Data '"cache", "storage"' always;

# Forward authentication headers from Authentik
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Real-IP $remote_addr;

# Pass through authentication results from Authentik
proxy_set_header X-authentik-username $http_x_authentik_username;
proxy_set_header X-authentik-groups $http_x_authentik_groups;
proxy_set_header X-authentik-email $http_x_authentik_email;
proxy_set_header X-authentik-name $http_x_authentik_name;
proxy_set_header X-authentik-uid $http_x_authentik_uid;

# Handle large headers (for OIDC tokens)
proxy_buffer_size 128k;
proxy_buffers 4 256k;
proxy_busy_buffers_size 256k;

# Properly handle authentication errors
# When Authentik returns 401/403, pass them through to the frontend
# This allows the frontend to handle the redirect properly
proxy_intercept_errors off;

# WebSocket support (if needed)
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";

# Timeouts
proxy_connect_timeout 60s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;
```

## Authentik Configuration

### 1. Proxy Provider Settings

In your Authentik Proxy Provider configuration:

- **Authentication flow**: Use your desired authentication flow
- **Authorization flow**: Use your desired authorization flow
- **Access token validity**: Set to desired value (default: 24h)
- **Mode**: Choose `Forward auth (single application)` or `Proxy` depending on your setup
- **External host**: Set to your SparkyFitness domain (e.g., `https://fitness.example.com`)
- **Token validity**: Ensure it matches your session requirements

### 2. Application Settings

In your Authentik Application:

- **Name**: SparkyFitness
- **Slug**: sparky-fitness
- **Provider**: Select your created proxy provider
- **Launch URL**: `https://your-sparky-domain.com/`

### 3. Outpost Configuration

If using Authentik outpost:

- **Type**: Proxy
- **Applications**: Select your SparkyFitness application
- **Configuration**:
  - Ensure outpost can reach both Authentik and your app
  - Configure health check endpoints

## Testing the Configuration

After applying the configuration:

1. **Test normal login**: Access your SparkyFitness URL and verify Authentik redirects you to login
2. **Test authenticated access**: After logging in, verify the app loads correctly
3. **Test session expiration**:
   - Log in to the app
   - Manually expire your Authentik session (Admin Interface → Sessions → Delete your session)
   - Refresh the SparkyFitness page
   - Expected: You should see a "Session Expired" toast and be redirected to Authentik login page
4. **Test 24h expiration**: Wait for natural session expiration or modify token validity for testing

## Troubleshooting

### Issue: Still seeing "Network load Error"

**Check:**
- Browser DevTools → Network tab → Look for 401/403 responses
- Verify the frontend change is deployed (check `api.ts:91-113`)
- Ensure Nginx is passing through 401/403 responses (`proxy_intercept_errors off`)

### Issue: Infinite redirect loop

**Possible causes:**
- OIDC redirect URI mismatch in Authentik provider
- Cookie domain mismatch
- CORS issues

**Fix:**
- Verify redirect URIs in Authentik match your frontend URL
- Check Authentik logs for authentication errors
- Ensure `SPARKY_FITNESS_FRONTEND_URL` environment variable is set correctly

### Issue: Authentication works but data doesn't load

**Check:**
- Backend logs for RLS (Row Level Security) errors
- Ensure session is properly created after OIDC callback
- Verify `/openid/api/me` returns user data

### Issue: Session expires too quickly

**Adjust:**
- Authentik Provider → Access token validity
- Authentik Application → Token validity
- Backend session configuration in `server.js` (currently 30 days)

## Architecture Overview

```
User Browser
    ↓
Nginx Proxy Manager (your current setup)
    ↓ (forwards auth)
Authentik Outpost/Proxy (handles authentication)
    ↓ (if authenticated)
SparkyFitness Container
    ↓
SparkyFitness Backend (handles OIDC callback + session)
```

## Additional Security Considerations

1. **HTTPS Only**: Ensure all connections use HTTPS in production
2. **Secure Cookies**: Backend automatically sets secure cookies in production
3. **SameSite Policy**: Current setting is environment-based (strict/lax/none)
4. **Token Encryption**: Client secrets are encrypted with AES-256-GCM
5. **Session Store**: Sessions stored in PostgreSQL, not in-memory

## Environment Variables

Ensure these are set in your backend container:

```bash
# Required for OIDC
SPARKY_FITNESS_FRONTEND_URL=https://your-sparky-domain.com

# JWT secret for session signing
JWT_SECRET=<your-64-char-hex-secret>

# Optional: Force email login fallback
SPARKY_FITNESS_FORCE_EMAIL_LOGIN=true

# Optional: Admin email
SPARKY_FITNESS_ADMIN_EMAIL=admin@example.com

# Database connection (for session store)
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

## Related Files

- Frontend API client: `SparkyFitnessFrontend/src/services/api.ts`
- Frontend auth hook: `SparkyFitnessFrontend/src/hooks/useAuth.tsx`
- Backend auth middleware: `SparkyFitnessServer/middleware/authMiddleware.js`
- Backend OIDC routes: `SparkyFitnessServer/openidRoutes.js`
- Backend session config: `SparkyFitnessServer/server.js`

## Support

If you continue experiencing issues:

1. Check Authentik logs: Admin Interface → System → Logs
2. Check SparkyFitness backend logs: `docker logs <container-name>`
3. Check browser console for errors
4. Review Nginx access/error logs

---

Last updated: 2025-11-11
