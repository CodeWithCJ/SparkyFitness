import { toast } from '@/hooks/use-toast';
import * as logging from '@/utils/logging';
import { getUserLoggingLevel } from '@/utils/userPreferences';

interface ApiCallOptions extends RequestInit {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: Record<string, any>;
  suppress404Toast?: boolean; // New option to suppress toast for 404 errors
  externalApi?: boolean;
  isFormData?: boolean; // New option to indicate if the body is FormData
  responseType?: 'json' | 'text' | 'blob'; // Add responseType option
}

export class HttpApiError extends Error {
  // Carries the HTTP status and any server-supplied error code so callers --
  // notably the React Query retry policy -- can tell a client error that will
  // never succeed on retry from a transient server error that might.
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'HttpApiError';
    this.status = status;
    this.code = code;
  }
}

export const API_BASE_URL = '/api';

// Requests the server has refused for this session with a DEMO_ code, mapped
// to the message it gave. Module scope, so it resets on reload; cleared on any
// sign-in or sign-out so a later non-demo session starts from a clean slate.
//
// Keyed on method *and* path. The demo guard blocks `/api/identity` only for
// mutating methods, so a path-only key would let a refused PUT answer the GET
// that the same screen depends on -- turning a read-only demo into a broken one.
const demoRestrictedEndpoints = new Map<string, string>();

const demoRestrictionKey = (method: string, endpoint: string): string =>
  `${method.toUpperCase()} ${endpoint}`;

export const clearDemoRestrictions = (): void => {
  demoRestrictedEndpoints.clear();
};
//export const API_BASE_URL = 'http://192.168.1.111:3010';

// A single-use guard so a reload triggered by gateway interception (see
// isGatewayInterceptedResponse) can't loop if the gateway keeps intercepting.
const GATEWAY_RELOAD_GUARD_KEY = 'sparky_gateway_reload_guard';
const GATEWAY_RELOAD_GUARD_TTL_MS = 10000;

// Indirection so tests can observe the reload without jsdom's unimplemented
// window.location.reload (same seam pattern as chunkRecoveryRuntime).
export const gatewayReloadRuntime = {
  reloadWindowLocation: () => window.location.reload(),
};

// Detects when a reverse-proxy auth gateway (e.g. Cloudflare Access) has
// intercepted an internal API call and returned its own login/redirect page
// instead of letting the request reach the backend. Such responses are not a
// real "logged out" signal from SparkyFitness and must not be treated as one.
function isGatewayInterceptedResponse(response: Response): boolean {
  if (response.type === 'opaqueredirect') {
    return true;
  }
  if (response.redirected) {
    try {
      if (new URL(response.url).origin !== window.location.origin) {
        return true;
      }
    } catch {
      // Ignore malformed URLs; fall through to content-type check.
    }
  }
  // Only sniff HTML on success responses. On an error status, an HTML body is
  // a proxy error page (nginx 502/504, a rate-limit page, Express's default
  // 404), not a gateway login page; reloading on those drops in-progress UI
  // state (issue #2051), so they take the normal error-toast path instead.
  if (!response.ok) {
    return false;
  }
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('text/html');
}

function reloadOnceForGatewayInterception(): void {
  const lastReload = Number(
    sessionStorage.getItem(GATEWAY_RELOAD_GUARD_KEY) || 0
  );
  if (Date.now() - lastReload < GATEWAY_RELOAD_GUARD_TTL_MS) {
    return;
  }
  sessionStorage.setItem(GATEWAY_RELOAD_GUARD_KEY, String(Date.now()));
  gatewayReloadRuntime.reloadWindowLocation();
}

// A blob response is always a Blob, never the caller's generic T — the overload
// keeps `responseType: 'blob'` callers from having to assert.
export function apiCall(
  endpoint: string,
  options: ApiCallOptions & { responseType: 'blob' }
): Promise<Blob>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function apiCall<T = any>(
  endpoint: string,
  options?: ApiCallOptions
): Promise<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiCall<T = any>(
  endpoint: string,
  options?: ApiCallOptions
): Promise<T> {
  const userLoggingLevel = getUserLoggingLevel();
  const isAbsoluteUrl = /^https?:\/\//.test(endpoint);
  const isExternal = options?.externalApi || isAbsoluteUrl;
  let url = isExternal ? endpoint : `${API_BASE_URL}${endpoint}`;

  const method = (options?.method || 'GET').toUpperCase();

  // A demo restriction is a standing policy for the whole session, not a
  // transient failure, so asking again can only ever get the same answer.
  // Several blocked endpoints are polled by components that mount on every
  // screen, which turned a permanent "no" into thousands of requests a minute
  // against the server. Answer from here instead of going back to the network.
  const demoRestriction = demoRestrictedEndpoints.get(
    demoRestrictionKey(method, endpoint)
  );
  if (demoRestriction !== undefined) {
    throw new HttpApiError(demoRestriction, 403, 'DEMO_ACTION_RESTRICTED');
  }

  if (options?.params) {
    // Filter out undefined values to prevent them from becoming the string "undefined" in URLSearchParams
    const definedParams = Object.fromEntries(
      Object.entries(options.params).filter(([_, v]) => v !== undefined)
    );
    const queryParams = new URLSearchParams(definedParams).toString();
    if (queryParams) {
      url = `${url}?${queryParams}`;
    }
  }
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {}), // Merge existing headers first
  };

  // Identify this client to the server as understanding the new meal serving
  // model (issue #1023). Older clients omit this header and the server applies
  // legacy "unit === 'serving' → multiplier = quantity" math for backwards
  // compatibility on diary-meal creates.
  if (!isExternal && !headers['X-Meal-Model-Version']) {
    headers['X-Meal-Model-Version'] = '2';
  }

  // Set Content-Type for JSON bodies unless it's FormData or already set
  if (!options?.isFormData && options?.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // If body is FormData, ensure Content-Type is not set to application/json
  if (options?.isFormData) {
    delete headers['Content-Type'];
  }

  // logging.debug(userLoggingLevel, `API Call: Final headers for ${endpoint}:`, headers);

  // The Authorization header is no longer needed as authentication is handled by httpOnly cookies.

  const config: RequestInit = {
    ...options,
    headers,
  };

  if (!isExternal) {
    config.credentials = 'include'; // Send cookies only with internal API requests
  }

  if (options?.body) {
    logging.debug(
      userLoggingLevel,
      `API Call: Request body for ${endpoint}:`,
      options.body
    );
    if (!options.isFormData && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    } else {
      config.body = options.body;
    }
  }

  try {
    logging.debug(
      userLoggingLevel,
      `API Call: Sending request to ${url} with config:`,
      config
    );
    const response = await fetch(url, config);
    logging.debug(
      userLoggingLevel,
      `API Call: Received response from ${url} with status:`,
      response.status
    );

    if (!isExternal && isGatewayInterceptedResponse(response)) {
      logging.error(
        userLoggingLevel,
        `API Call: Response for ${url} looks like it was intercepted by an upstream auth gateway (e.g. Cloudflare Access) rather than answered by the backend. Reloading to re-authenticate.`
      );
      reloadOnceForGatewayInterception();
      // Reload is async; avoid processing this response as a real API result/error.
      return new Promise(() => {});
    }

    if (!response.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let errorData: any;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.indexOf('application/json') !== -1) {
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { message: 'Failed to parse JSON error response.' };
        }
      } else {
        errorData = { message: await response.text() };
      }
      const errorMessage =
        (errorData.error ? String(errorData.error) : '') ||
        (errorData.message ? String(errorData.message) : '') ||
        `API call failed with status ${response.status}`;
      logging.error(userLoggingLevel, `API Call: Error response from ${url}:`, {
        status: response.status,
        errorData,
      });

      // Special handling for 400 errors on recent/top endpoints
      if (
        response.status === 400 &&
        (endpoint === '/exercises/recent' || endpoint === '/exercises/top')
      ) {
        logging.debug(
          userLoggingLevel,
          `Frontend workaround triggered for ${endpoint}: Backend returned 400. Returning empty array.`
        );
        return [] as unknown as T; // Return empty array to gracefully handle 400 errors on these endpoints
      }

      // Special handling for 404 errors on exercise search endpoints
      if (
        response.status === 404 &&
        endpoint.startsWith('/exercises/search/')
      ) {
        logging.debug(
          userLoggingLevel,
          `Frontend workaround triggered for ${endpoint}: Backend returned 404. Returning empty array.`
        );
        return [] as unknown as T; // Return empty array to gracefully handle 404 errors on exercise search
      }

      // Suppress toast for 404 errors if suppress404Toast is true
      if (response.status === 404 && options?.suppress404Toast) {
        logging.debug(
          userLoggingLevel,
          `API call returned 404 for ${endpoint}, toast suppressed. Returning null.`
        );
        return null as unknown as T; // Return null for 404 with suppression
      } else {
        const errorCode = errorData.code ? String(errorData.code) : undefined;
        const isDemoRestriction = errorCode?.startsWith('DEMO_') ?? false;
        // DEMO_UPLOAD_RESTRICTED is deliberately not memoized: the guard
        // decides it from the request's content type, not its route, so the
        // same method and path can legitimately be allowed with a JSON body.
        // Uploads are click-driven anyway, so there is no polling flood to
        // head off here.
        if (
          isDemoRestriction &&
          errorCode !== 'DEMO_UPLOAD_RESTRICTED' &&
          !isExternal
        ) {
          demoRestrictedEndpoints.set(
            demoRestrictionKey(method, endpoint),
            errorMessage
          );
        }
        // Demo-account restrictions are a standing policy, not an incident: the
        // blocked endpoints are polled by components that mount on every page,
        // so toasting each rejection buries the screen in identical popups and
        // makes real errors impossible to spot. Only reads are silenced --
        // a write is something the visitor just clicked, and swallowing that
        // leaves them staring at a button that appears to do nothing.
        if (!isDemoRestriction || method !== 'GET') {
          toast({
            title: 'API Error',
            description: errorMessage,
            variant: 'destructive',
          });
        }
        if (
          errorMessage.includes('Authentication: Invalid or expired token.')
        ) {
          localStorage.removeItem('token');
          // window.location.reload(); // Removed aggressive reload, causing loops
        }
        throw new HttpApiError(errorMessage, response.status, errorCode);
      }
    }

    // Handle different response types
    if (options?.responseType === 'blob') {
      const blobResponse = await response.blob();
      logging.debug(
        userLoggingLevel,
        `API Call: Received blob response from ${url}.`
      );
      return blobResponse as unknown as T;
    }
    // Handle cases where the response might be empty (e.g., DELETE requests)
    const text = await response.text();
    const jsonResponse = text ? JSON.parse(text) : {};
    logging.debug(
      userLoggingLevel,
      `API Call: Received JSON response from ${url}:`,
      jsonResponse
    );
    //console.log(`API Call: Returning JSON response for ${url}:`, jsonResponse); // Added console.log
    return jsonResponse;
  } catch (err: unknown) {
    if (err instanceof HttpApiError) {
      throw err;
    }

    const errorMessage = err instanceof Error ? err.message : String(err);
    logging.error(userLoggingLevel, 'API call network error:', err); // Log the raw error object for better debugging
    toast({
      title: 'Network Error',
      description: errorMessage || 'Could not connect to the server.',
      variant: 'destructive',
    });
    throw new Error(errorMessage, { cause: err });
  }
}

interface ApiGet {
  (
    endpoint: string,
    options: ApiCallOptions & { responseType: 'blob' }
  ): Promise<Blob>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (endpoint: string, options?: ApiCallOptions): Promise<any>;
}

const get: ApiGet = (
  endpoint: string,
  options?: ApiCallOptions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => apiCall(endpoint, { ...options, method: 'GET' });

export const api = {
  get,
  post: (endpoint: string, options?: ApiCallOptions) =>
    apiCall(endpoint, { ...options, method: 'POST' }),
  put: (endpoint: string, options?: ApiCallOptions) =>
    apiCall(endpoint, { ...options, method: 'PUT' }),
  delete: (endpoint: string, options?: ApiCallOptions) =>
    apiCall(endpoint, { ...options, method: 'DELETE' }),
};
