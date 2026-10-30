import http from 'node:http';
import https from 'node:https';
import axios from 'axios';
import { z } from 'zod';
import { log } from '../config/logging.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import { describeError } from '../utils/errors.js';
import type { ProviderEndpoint } from './providerEndpoint.js';
import {
  resolveWeatherProvider,
  type ResolvedWeatherProvider,
} from './weatherConfig.js';

/**
 * Open-Meteo's own hosts serve the forecast and the archive from different
 * names; a self-hosted or other compatible server serves both under its one
 * base URL, so any other base is used for both.
 */
const ARCHIVE_HOSTS: Readonly<Record<string, string>> = {
  'api.open-meteo.com': 'archive-api.open-meteo.com',
  'customer-api.open-meteo.com': 'customer-archive-api.open-meteo.com',
};

/**
 * The archive reanalysis lags a few days behind, so a recent activity is
 * looked up on the forecast endpoint (which serves the past 92 days) and an
 * older one on the archive.
 */
const ARCHIVE_AFTER_DAYS = 7;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

export interface WeatherReading {
  weather_temp_celsius: number | null;
  weather_condition: string | null;
  weather_wind_speed_mps: number | null;
  weather_humidity_percentage: number | null;
}

export interface WeatherLocation {
  lat: number;
  lon: number;
  /** ISO instant the activity started. */
  t: string;
}

const hourlySchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number().nullable()),
    relative_humidity_2m: z.array(z.number().nullable()),
    wind_speed_10m: z.array(z.number().nullable()),
    weather_code: z.array(z.number().nullable()),
  }),
});

// WMO weather interpretation codes, as returned by Open-Meteo.
const WMO_CONDITIONS: Readonly<Record<number, string>> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with hail',
};

export function weatherCodeToCondition(code: number | null): string | null {
  if (code === null) return null;
  return WMO_CONDITIONS[code] ?? null;
}

/** `2026-10-15T07:00` for the UTC hour an instant falls in. */
function utcHourKey(at: Date): string {
  return at.toISOString().slice(0, 13) + ':00';
}

/** The forecast and archive URLs for a provider's base URL. */
function endpointUrls(baseUrl: string): { forecast: string; archive: string } {
  const base = baseUrl.trim().replace(/\/+$/, '');
  const forecast = `${base}/v1/forecast`;
  try {
    const parsed = new URL(base);
    const archiveHost = ARCHIVE_HOSTS[parsed.hostname.toLowerCase()];
    if (archiveHost) {
      parsed.hostname = archiveHost;
      const archiveBase = parsed.toString().replace(/\/+$/, '');
      return { forecast, archive: `${archiveBase}/v1/archive` };
    }
  } catch {
    // Not a parseable URL: fall through to the same base for both.
  }
  return { forecast, archive: `${base}/v1/archive` };
}

/**
 * The weather at a place and hour, from the given Open-Meteo compatible
 * endpoint. Coordinates are rounded to two decimals
 * (about a kilometre) before they leave the server: that is as fine as the
 * weather grid, and no finer than a person would want shared. Returns null for
 * anything that cannot be answered; it never throws.
 */
export async function fetchWeatherAt(
  endpoint: ProviderEndpoint & { apiKey?: string },
  lat: number,
  lon: number,
  at: Date
): Promise<WeatherReading | null> {
  const day = at.toISOString().slice(0, 10);
  const ageDays = (Date.now() - at.getTime()) / MS_PER_DAY;
  const urls = endpointUrls(endpoint.url);
  try {
    const response = await axios.get(
      ageDays > ARCHIVE_AFTER_DAYS ? urls.archive : urls.forecast,
      {
        params: {
          latitude: lat.toFixed(2),
          longitude: lon.toFixed(2),
          hourly:
            'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
          wind_speed_unit: 'ms',
          timezone: 'GMT',
          start_date: day,
          end_date: day,
          // Open-Meteo's commercial endpoints take the key as `apikey`.
          ...(endpoint.apiKey ? { apikey: endpoint.apiKey } : {}),
        },
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 0,
        maxContentLength: MAX_RESPONSE_BYTES,
        // Names resolve through the SSRF guard on every connection.
        ...(endpoint.lookup
          ? {
              httpAgent: new http.Agent({ lookup: endpoint.lookup }),
              httpsAgent: new https.Agent({ lookup: endpoint.lookup }),
            }
          : {}),
      }
    );
    const parsed = hourlySchema.safeParse(response.data);
    if (!parsed.success) {
      log('warn', 'Weather lookup returned an unexpected response.');
      return null;
    }
    const { hourly } = parsed.data;
    const index = hourly.time.indexOf(utcHourKey(at));
    if (index < 0) return null;
    const temp = hourly.temperature_2m[index] ?? null;
    const humidity = hourly.relative_humidity_2m[index] ?? null;
    const wind = hourly.wind_speed_10m[index] ?? null;
    const condition = weatherCodeToCondition(
      hourly.weather_code[index] ?? null
    );
    if (
      temp === null &&
      humidity === null &&
      wind === null &&
      condition === null
    ) {
      return null;
    }
    return {
      weather_temp_celsius: temp,
      weather_condition: condition,
      weather_wind_speed_mps: wind,
      weather_humidity_percentage: humidity,
    };
  } catch (error) {
    // Only the message: the request carries the provider's API key.
    log('warn', `Weather lookup failed: ${describeError(error)}`);
    return null;
  }
}

function hasWeather(
  entry: Record<string, unknown> | null | undefined
): boolean {
  if (!entry) return false;
  return [
    'weather_temp_celsius',
    'weather_condition',
    'weather_wind_speed_mps',
    'weather_humidity_percentage',
  ].some((column) => entry[column] !== null && entry[column] !== undefined);
}

function isUsableStart(start: WeatherLocation): boolean {
  const at = Date.parse(start.t);
  return (
    Number.isFinite(at) &&
    // A watch or phone with a wrong clock, or a placeholder fix, would
    // otherwise ask for a forecast of the future or the middle of the ocean.
    at <= Date.now() + MS_PER_HOUR &&
    Number.isFinite(start.lat) &&
    Number.isFinite(start.lon) &&
    Math.abs(start.lat) <= 90 &&
    Math.abs(start.lon) <= 180 &&
    !(start.lat === 0 && start.lon === 0)
  );
}

/**
 * Fills in the weather at the start of an activity that has none. Best
 * effort and safe to leave running after the request that triggered it has
 * been answered: it does nothing unless the person has a weather provider
 * (their own, the admin's public one or a family member's shared one), never
 * replaces weather a device provider (Garmin) already supplied, and never
 * throws.
 */
export async function attachWeatherToExerciseEntry(
  userId: string,
  exerciseEntryId: string,
  start: WeatherLocation
): Promise<void> {
  if (!isUsableStart(start)) return;
  try {
    // No provider means no lookup: the start time and the rounded start place
    // are only ever sent to a server the person (or their admin or family)
    // added on purpose. Checked first so nothing else runs without one, and it
    // fails closed if the provider cannot be read or its URL is not allowed.
    const provider: ResolvedWeatherProvider | null =
      await resolveWeatherProvider(userId);
    if (!provider) return;
    const entry = await exerciseEntryRepository.getExerciseEntryById(
      exerciseEntryId,
      userId
    );
    if (!entry || hasWeather(entry)) return;
    const weather = await fetchWeatherAt(
      provider,
      start.lat,
      start.lon,
      new Date(start.t)
    );
    if (!weather) return;
    await exerciseEntryRepository.updateExerciseEntryTelemetryOnly(
      exerciseEntryId,
      userId,
      weather
    );
  } catch (error) {
    log(
      'warn',
      `Could not attach weather to exercise entry ${exerciseEntryId}: ${describeError(error)}`
    );
  }
}
