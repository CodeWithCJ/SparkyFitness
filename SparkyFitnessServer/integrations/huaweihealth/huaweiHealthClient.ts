import crypto from 'node:crypto';
import axios from 'axios';
import { z } from 'zod/v4';
import {
  huaweiActivitiesResponseSchema,
  huaweiConsentsResponseSchema,
  huaweiDailySummaryResponseSchema,
  huaweiSleepRecordsResponseSchema,
  type HuaweiActivitiesResponse,
  type HuaweiDailySummaryResponse,
  type HuaweiSleepRecordsResponse,
} from './huaweiHealthApiSchemas.js';
import {
  getHuaweiHealthConfig,
  HUAWEI_HEALTH_API_BASE_URL,
} from './huaweiHealthConfig.js';
import { HuaweiHealthError } from './huaweiHealthErrors.js';

interface HuaweiHttpResponse {
  data: unknown;
  headers?: unknown;
}

interface HuaweiHealthHttpClient {
  post(
    url: string,
    body: unknown,
    config: { headers: Record<string, string> }
  ): Promise<HuaweiHttpResponse>;
  get(
    url: string,
    config: {
      headers: Record<string, string>;
      params: Record<string, unknown>;
    }
  ): Promise<HuaweiHttpResponse>;
}

interface HuaweiHealthClientDependencies {
  httpClient: HuaweiHealthHttpClient;
  randomUUID(): string;
}

interface DailySummaryRequest {
  dataTypes: string[];
  startDay: string;
  endDay: string;
  timeZone: string;
}

function requireConfig() {
  const config = getHuaweiHealthConfig();
  if (!config) {
    throw new HuaweiHealthError(
      'HUAWEI_NOT_CONFIGURED',
      503,
      'HUAWEI Health is not configured for this SparkyFitness instance.'
    );
  }
  return config;
}

function readHeader(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') return null;
  const headerObject = headers as {
    get?: (key: string) => unknown;
    [key: string]: unknown;
  };
  const fromGetter = headerObject.get?.(name);
  const value =
    fromGetter ??
    headerObject[name] ??
    headerObject[name.toLowerCase()] ??
    headerObject[name.toUpperCase()];
  return value === undefined || value === null ? null : String(value);
}

function assertPrivacyState(headers: unknown): void {
  const privacy = readHeader(headers, 'x-health-app-privacy');
  if (privacy === '2') {
    throw new HuaweiHealthError(
      'HUAWEI_PRIVACY_DISABLED',
      403,
      'HUAWEI Health data sharing is disabled for this app.'
    );
  }
  if (privacy === '3') {
    throw new HuaweiHealthError(
      'HUAWEI_HEALTH_APP_REQUIRED',
      409,
      'The HUAWEI Health app is required for cloud health data.'
    );
  }
}

function parseProviderResponse<T>(
  schema: z.ZodType<T>,
  response: HuaweiHttpResponse
): T {
  assertPrivacyState(response.headers);
  const parsed = schema.safeParse(response.data);
  if (!parsed.success) {
    throw new HuaweiHealthError(
      'HUAWEI_API_RESPONSE_INVALID',
      502,
      'Huawei returned an invalid health-data response.'
    );
  }
  return parsed.data;
}

export function createHuaweiHealthClient(
  dependencies: HuaweiHealthClientDependencies
) {
  const { httpClient, randomUUID } = dependencies;

  const headers = (accessToken: string): Record<string, string> => ({
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'x-caller-trace-id': randomUUID(),
    'x-client-id': requireConfig().clientId,
    'x-version': process.env.npm_package_version?.trim() || 'unknown',
  });

  return {
    async fetchGrantedScopes(accessToken: string): Promise<string[]> {
      const config = requireConfig();
      let response: HuaweiHttpResponse;
      try {
        response = await httpClient.get(
          `${HUAWEI_HEALTH_API_BASE_URL}/consents/${encodeURIComponent(config.appId)}`,
          {
            headers: headers(accessToken),
            params: { lang: 'en' },
          }
        );
      } catch (error) {
        if (error instanceof HuaweiHealthError) throw error;
        throw new HuaweiHealthError(
          'HUAWEI_API_REQUEST_FAILED',
          502,
          'The HUAWEI Health consent request failed.',
          { cause: error }
        );
      }
      const consent = parseProviderResponse(
        huaweiConsentsResponseSchema,
        response
      );
      return Object.keys(consent.url2Desc);
    },

    async fetchDailySummary(
      accessToken: string,
      request: DailySummaryRequest
    ): Promise<HuaweiDailySummaryResponse> {
      let response: HuaweiHttpResponse;
      try {
        response = await httpClient.post(
          `${HUAWEI_HEALTH_API_BASE_URL}/sampleSet:dailyPolymerize`,
          request,
          { headers: headers(accessToken) }
        );
      } catch (error) {
        if (error instanceof HuaweiHealthError) throw error;
        throw new HuaweiHealthError(
          'HUAWEI_API_REQUEST_FAILED',
          502,
          'The HUAWEI Health daily summary request failed.',
          { cause: error }
        );
      }
      return parseProviderResponse(huaweiDailySummaryResponseSchema, response);
    },

    async fetchSleepRecords(
      accessToken: string,
      startInclusive: Date,
      endExclusive: Date
    ): Promise<HuaweiSleepRecordsResponse> {
      const startNs = (
        BigInt(startInclusive.getTime()) * 1_000_000n
      ).toString();
      const endNs = (
        BigInt(endExclusive.getTime() - 1) * 1_000_000n
      ).toString();
      let response: HuaweiHttpResponse;
      try {
        response = await httpClient.get(
          `${HUAWEI_HEALTH_API_BASE_URL}/healthRecords`,
          {
            headers: headers(accessToken),
            params: {
              startTime: startNs,
              endTime: endNs,
              dataType: 'com.huawei.health.record.sleep',
            },
          }
        );
      } catch (error) {
        if (error instanceof HuaweiHealthError) throw error;
        throw new HuaweiHealthError(
          'HUAWEI_API_REQUEST_FAILED',
          502,
          'The HUAWEI Health sleep request failed.',
          { cause: error }
        );
      }
      return parseProviderResponse(huaweiSleepRecordsResponseSchema, response);
    },

    async fetchActivities(
      accessToken: string,
      startTime: number,
      endTime: number
    ): Promise<HuaweiActivitiesResponse> {
      const combined: HuaweiActivitiesResponse = {
        activityRecord: [],
        deletedActivityRecord: [],
      };
      let params: Record<string, unknown> = { startTime, endTime };
      const seenCursors = new Set<string>();

      for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
        let response: HuaweiHttpResponse;
        try {
          response = await httpClient.get(
            `${HUAWEI_HEALTH_API_BASE_URL}/activityRecords`,
            { headers: headers(accessToken), params }
          );
        } catch (error) {
          if (error instanceof HuaweiHealthError) throw error;
          throw new HuaweiHealthError(
            'HUAWEI_API_REQUEST_FAILED',
            502,
            'The HUAWEI Health activity request failed.',
            { cause: error }
          );
        }
        const page = parseProviderResponse(
          huaweiActivitiesResponseSchema,
          response
        );
        combined.activityRecord.push(...page.activityRecord);
        combined.deletedActivityRecord.push(...page.deletedActivityRecord);
        if (!page.hasMoreData) return combined;
        if (!page.cursor || seenCursors.has(page.cursor)) {
          throw new HuaweiHealthError(
            'HUAWEI_API_RESPONSE_INVALID',
            502,
            'Huawei returned invalid activity pagination metadata.'
          );
        }
        seenCursors.add(page.cursor);
        params = { cursor: page.cursor };
      }

      throw new HuaweiHealthError(
        'HUAWEI_API_RESPONSE_INVALID',
        502,
        'Huawei activity pagination exceeded the safety limit.'
      );
    },
  };
}

const huaweiHealthClient = createHuaweiHealthClient({
  httpClient: axios,
  randomUUID: () => crypto.randomUUID(),
});

export default huaweiHealthClient;
