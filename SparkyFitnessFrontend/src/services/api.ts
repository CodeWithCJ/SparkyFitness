import { toast } from "@/hooks/use-toast";
import { warn, error, debug } from "@/utils/logging";
import { getUserLoggingLevel } from "@/utils/userPreferences";

interface ApiCallOptions extends RequestInit {
  body?: any;
  params?: Record<string, any>;
  suppress404Toast?: boolean; // New option to suppress toast for 404 errors
  externalApi?: boolean;
  isFormData?: boolean; // New option to indicate if the body is FormData
  responseType?: 'json' | 'text' | 'blob'; // Add responseType option
}

export const API_BASE_URL = "/api";
//export const API_BASE_URL = 'http://192.168.1.111:3010';

// Key for tracking redirect attempts in localStorage (persists across page reloads)
// Exported so other modules can clear this when authentication succeeds
export const REDIRECT_TRACKING_KEY = 'sparky_auth_redirect_time';

// Clean up stale redirect timestamps on app initialization
// This prevents old timestamps from blocking redirects after browser restart
(function cleanupStaleTimestamp() {
  const lastRedirectTimeStr = localStorage.getItem(REDIRECT_TRACKING_KEY);
  if (lastRedirectTimeStr) {
    const lastRedirectTime = parseInt(lastRedirectTimeStr, 10);
    const now = Date.now();
    const age = now - lastRedirectTime;

    // If timestamp is older than 30 seconds, it's stale - clear it
    // This ensures old timestamps from previous sessions don't block redirects
    if (age > 30000) {
      console.debug(`Clearing stale redirect timestamp (${age}ms old)`);
      localStorage.removeItem(REDIRECT_TRACKING_KEY);
    } else {
      console.debug(`Keeping recent redirect timestamp (${age}ms old)`);
    }
  }
})();

// Global flag to prevent multiple simultaneous redirects within the same page session
let isRedirectingToLogin = false;

export async function apiCall(endpoint: string, options?: ApiCallOptions): Promise<any> {
  const userLoggingLevel = getUserLoggingLevel();
  let url = options?.externalApi ? endpoint : `${API_BASE_URL}${endpoint}`;

  if (options?.params) {
    const queryParams = new URLSearchParams(options.params).toString();
    url = `${url}?${queryParams}`;
  }
  const headers: HeadersInit = {
    ...options?.headers,
  };

  if (!options?.isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  // The Authorization header is no longer needed as authentication is handled by httpOnly cookies.

  const config: RequestInit = {
    ...options,
    headers,
  };

  if (!options?.externalApi) {
    config.credentials = 'include'; // Send cookies only with internal API requests
  }

  if (options?.body) {
    debug(userLoggingLevel, `API Call: Request body for ${endpoint}:`, options.body);
    if (!options.isFormData && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    } else {
      config.body = options.body;
    }
  }

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      let errorData: any;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: "Failed to parse JSON error response." };
        }
      } else {
        errorData = { message: await response.text() };
      }
      const errorMessage = errorData.error || errorData.message || `API call failed with status ${response.status}`;

      // Special handling for 400 errors on recent/top endpoints
      if (
        response.status === 400 &&
        (endpoint === '/exercises/recent' || endpoint === '/exercises/top')
      ) {
        debug(userLoggingLevel, `Frontend workaround triggered for ${endpoint}: Backend returned 400. Returning empty array.`);
        return []; // Return empty array to gracefully handle 400 errors on these endpoints
      }

      // Special handling for 404 errors on exercise search endpoints
      if (response.status === 404 && endpoint.startsWith('/exercises/search/')) {
        debug(userLoggingLevel, `Frontend workaround triggered for ${endpoint}: Backend returned 404. Returning empty array.`);
        return []; // Return empty array to gracefully handle 404 errors on exercise search
      }

      // Suppress toast for 404 errors if suppress404Toast is true
      if (response.status === 404 && options?.suppress404Toast) {
        debug(userLoggingLevel, `API call returned 404 for ${endpoint}, toast suppressed. Returning null.`);
        return null; // Return null for 404 with suppression
      }

      // Handle authentication errors (401) and authorization errors (403)
      // When session expires or Authentik logs user out, redirect to trigger re-authentication
      if (response.status === 401 || response.status === 403) {
        warn(userLoggingLevel, `Authentication/Authorization failed for ${endpoint}: ${response.status} ${errorMessage}`);

        // Clear any local storage auth data
        localStorage.removeItem('token');

        // Show a more user-friendly error message
        toast({
          title: "Session Expired",
          description: "Your session has expired. Please log in again.",
          variant: "destructive",
        });

        // Redirect to root - this will trigger Authentik proxy to redirect to login
        // Using a small delay to ensure the toast is visible
        setTimeout(() => {
          window.location.href = '/';
        }, 500);

        throw new Error(errorMessage);
      }

      // Handle all other errors
      toast({
        title: "API Error",
        description: errorMessage,
        variant: "destructive",
      });
      throw new Error(errorMessage);
    }

    // Handle different response types
    if (options?.responseType === 'blob') {
      return await response.blob();
    }
    // Handle cases where the response might be empty (e.g., DELETE requests)
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch (err: any) {
    error(userLoggingLevel, "API call network error:", err);

    // Network errors can be caused by Authentik proxy redirecting to login page
    // This happens when the session expires and Authentik returns a 302 redirect
    // The browser sees this as a CORS error and throws NetworkError
    // Check if this might be an authentication issue
    if (err.message && (err.message.includes('NetworkError') || err.message.includes('Failed to fetch'))) {
      const now = Date.now();

      // Check last redirect time from localStorage (persists across page reloads)
      const lastRedirectTimeStr = localStorage.getItem(REDIRECT_TRACKING_KEY);
      const lastRedirectTime = lastRedirectTimeStr ? parseInt(lastRedirectTimeStr, 10) : 0;
      const timeSinceLastRedirect = now - lastRedirectTime;

      const detectMessage = `NetworkError detected. Last redirect: ${timeSinceLastRedirect}ms ago. Threshold: 5000ms`;
      debug(userLoggingLevel, detectMessage);
      console.log('SPARKY AUTH:', detectMessage); // Also log to console for visibility

      // Only trigger redirect once, even if multiple API calls fail simultaneously
      // Also prevent redirect loops by checking if we tried recently (within 5 seconds)
      // Using 5 seconds to give Authentik enough time to handle the redirect
      if (!isRedirectingToLogin && timeSinceLastRedirect > 5000) {
        isRedirectingToLogin = true;

        warn(userLoggingLevel, `Triggering redirect to login. Last redirect was ${timeSinceLastRedirect}ms ago.`);

        // Store redirect time in localStorage so it persists across page reloads
        localStorage.setItem(REDIRECT_TRACKING_KEY, now.toString());

        // Clear ALL storage to prevent cache issues
        localStorage.clear();
        sessionStorage.clear();

        // Re-set the redirect tracking after clearing
        localStorage.setItem(REDIRECT_TRACKING_KEY, now.toString());

        toast({
          title: "Session Expired",
          description: "Your session has expired. Redirecting to login...",
          variant: "destructive",
        });

        // Do a hard reload to force Authentik to intercept
        // This clears all caches and forces a fresh request
        // The reload() method forces a reload from server, not cache
        try {
          warn(userLoggingLevel, 'Calling window.location.reload() to force Authentik intercept');
          // Force reload from server (bypasses cache)
          window.location.reload();
        } catch (reloadError) {
          // If reload fails, try replace as fallback
          warn(userLoggingLevel, 'Reload failed, trying window.location.replace()');
          try {
            window.location.replace('/');
          } catch (replaceError) {
            // Last resort
            warn(userLoggingLevel, 'Replace failed, trying window.location.href');
            window.location.href = '/';
          }
        }
      } else {
        // We recently redirected - don't redirect again to prevent loops
        const skipMessage = `Skipping redirect to prevent loop (last redirect was ${timeSinceLastRedirect}ms ago, threshold is 5000ms)`;
        warn(userLoggingLevel, skipMessage);
        console.warn('SPARKY AUTH:', skipMessage); // Also log to console for visibility
      }

      // Don't throw error - just return a rejected promise
      // This prevents upstream error handlers from interfering with redirect
      return Promise.reject(new Error('Session expired - redirecting to login'));
    }

    // For other network errors, show generic error
    toast({
      title: "Network Error",
      description: err.message || "Could not connect to the server.",
      variant: "destructive",
    });
    throw new Error(err.message);
  }
}

export const api = {
  get: (endpoint: string, options?: ApiCallOptions) => apiCall(endpoint, { ...options, method: 'GET' }),
  post: (endpoint: string, options?: ApiCallOptions) => apiCall(endpoint, { ...options, method: 'POST' }),
  put: (endpoint: string, options?: ApiCallOptions) => apiCall(endpoint, { ...options, method: 'PUT' }),
  delete: (endpoint: string, options?: ApiCallOptions) => apiCall(endpoint, { ...options, method: 'DELETE' }),
};