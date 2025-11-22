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

export async function apiCall(endpoint: string, options?: ApiCallOptions): Promise<any> {
  const userLoggingLevel = getUserLoggingLevel();
  let url = options?.externalApi ? endpoint : `${API_BASE_URL}${endpoint}`;

  if (options?.params) {
    const queryParams = new URLSearchParams(options.params).toString();
    url = `${url}?${queryParams}`;
  }
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}), // Merge existing headers first
  };

  // Set Content-Type for JSON bodies unless it's FormData or already set
  if (!options?.isFormData && options?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // If body is FormData, ensure Content-Type is not set to application/json
  if (options?.isFormData) {
    delete headers['Content-Type'];
  }

  // debug(userLoggingLevel, `API Call: Final headers for ${endpoint}:`, headers);

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
    debug(userLoggingLevel, `API Call: Sending request to ${url} with config:`, config);
    const response = await fetch(url, config);
    debug(userLoggingLevel, `API Call: Received response from ${url} with status:`, response.status);

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
      error(userLoggingLevel, `API Call: Error response from ${url}:`, { status: response.status, errorData });

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
      } else {
        toast({
          title: "API Error",
          description: errorMessage,
          variant: "destructive",
        });
        if (errorMessage.includes('Authentication: Invalid or expired token.')) {
          localStorage.removeItem('token');
          window.location.reload();
        }
        throw new Error(errorMessage);
      }
    }

    // Handle different response types
    if (options?.responseType === 'blob') {
      const blobResponse = await response.blob();
      debug(userLoggingLevel, `API Call: Received blob response from ${url}.`);
      return blobResponse;
    }
    // Handle cases where the response might be empty (e.g., DELETE requests)
    const text = await response.text();
    const jsonResponse = text ? JSON.parse(text) : {};
    debug(userLoggingLevel, `API Call: Received JSON response from ${url}:`, jsonResponse);
    return jsonResponse;
  } catch (err: any) {
    error(userLoggingLevel, "API call network error:", err);
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