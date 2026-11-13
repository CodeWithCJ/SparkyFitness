import type {
  CreateRouteBody,
  GenerateRouteBody,
  GenerateRouteResponse,
  ImportGpxRouteBody,
  Route,
  RouteFromActivityBody,
  RouteSummary,
  UpdateRouteBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Routes API';

/** The person's saved routes, newest first, without their points. */
export const fetchRoutes = (): Promise<{ routes: RouteSummary[] }> =>
  apiFetch<{ routes: RouteSummary[] }>({
    endpoint: '/api/v2/routes',
    serviceName: SERVICE,
    operation: 'fetch routes',
  });

export const fetchRoute = (id: string): Promise<{ route: Route }> =>
  apiFetch<{ route: Route }>({
    endpoint: `/api/v2/routes/${id}`,
    serviceName: SERVICE,
    operation: 'fetch route',
  });

export const createRoute = (
  body: Pick<CreateRouteBody, 'name' | 'points'> & Partial<CreateRouteBody>
): Promise<{ route: Route }> =>
  apiFetch<{ route: Route }>({
    endpoint: '/api/v2/routes',
    serviceName: SERVICE,
    operation: 'create route',
    method: 'POST',
    body,
  });

export const importGpxRoute = (
  body: Omit<ImportGpxRouteBody, 'activity'> & Partial<ImportGpxRouteBody>
): Promise<{ route: Route }> =>
  apiFetch<{ route: Route }>({
    endpoint: '/api/v2/routes/import-gpx',
    serviceName: SERVICE,
    operation: 'import GPX route',
    method: 'POST',
    body,
  });

export const createRouteFromActivity = (
  exerciseEntryId: string,
  body: RouteFromActivityBody = {}
): Promise<{ route: Route }> =>
  apiFetch<{ route: Route }>({
    endpoint: `/api/v2/routes/from-activity/${exerciseEntryId}`,
    serviceName: SERVICE,
    operation: 'save activity as route',
    method: 'POST',
    body,
  });

export const updateRoute = (
  id: string,
  body: UpdateRouteBody
): Promise<{ route: Route }> =>
  apiFetch<{ route: Route }>({
    endpoint: `/api/v2/routes/${id}`,
    serviceName: SERVICE,
    operation: 'update route',
    method: 'PATCH',
    body,
  });

export const deleteRoute = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/routes/${id}`,
    serviceName: SERVICE,
    operation: 'delete route',
    method: 'DELETE',
  });

/**
 * What the server offers for generating routes. Older
 * servers send only `available`; read the answer with
 * `resolveRouteGenerateCapabilities`.
 */
export const fetchRouteGenerationCapabilities = (): Promise<unknown> =>
  apiFetch<unknown>({
    endpoint: '/api/v2/routes/generate/capabilities',
    serviceName: SERVICE,
    operation: 'check route generation',
  });

/** Preview routes from the routing engine: `route` is the first of `options`. */
export const generateRoute = (
  body: GenerateRouteBody
): Promise<GenerateRouteResponse> =>
  apiFetch<GenerateRouteResponse>({
    endpoint: '/api/v2/routes/generate',
    serviceName: SERVICE,
    operation: 'generate route',
    method: 'POST',
    body,
    // A loop can cost the server a few engine calls, several candidates more.
    timeoutMs: 90_000,
  });
