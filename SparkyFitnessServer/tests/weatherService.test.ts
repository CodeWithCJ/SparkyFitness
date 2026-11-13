import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest';
import axios from 'axios';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import { resolveWeatherProvider } from '../services/weatherConfig.js';
import {
  attachWeatherToExerciseEntry,
  fetchWeatherAt,
  weatherCodeToCondition,
} from '../services/weatherService.js';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../services/weatherConfig', () => ({
  resolveWeatherProvider: vi.fn(),
}));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    getExerciseEntryById: vi.fn(),
    updateExerciseEntryTelemetryOnly: vi.fn(),
  },
}));

const mockedGet = vi.mocked(axios.get);
const resolveProvider = vi.mocked(resolveWeatherProvider);
const PUBLIC_ENDPOINT = { url: 'https://api.open-meteo.com' };
const getEntry = vi.mocked(exerciseEntryRepository.getExerciseEntryById);
const updateTelemetry = vi.mocked(
  exerciseEntryRepository.updateExerciseEntryTelemetryOnly
);

const NOW = new Date('2026-10-15T12:00:00Z');
const START = '2026-10-15T07:25:10.000Z';

const hourlyBody = {
  hourly: {
    time: ['2026-10-15T06:00', '2026-10-15T07:00', '2026-10-15T08:00'],
    temperature_2m: [8.1, 9.4, 10.2],
    relative_humidity_2m: [90, 86, 80],
    wind_speed_10m: [2.1, 3.3, 3.9],
    weather_code: [3, 61, 2],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resolveProvider.mockResolvedValue(PUBLIC_ENDPOINT);
  mockedGet.mockResolvedValue({ data: hourlyBody });
  getEntry.mockResolvedValue({ id: 'entry-1', weather_temp_celsius: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('weatherCodeToCondition', () => {
  it('names known codes and returns null for unknown ones', () => {
    expect(weatherCodeToCondition(61)).toBe('Light rain');
    expect(weatherCodeToCondition(95)).toBe('Thunderstorm');
    expect(weatherCodeToCondition(1234)).toBeNull();
    expect(weatherCodeToCondition(null)).toBeNull();
  });
});

describe('fetchWeatherAt', () => {
  it('picks the hour the activity started in', async () => {
    const weather = await fetchWeatherAt(
      PUBLIC_ENDPOINT,
      51.5012,
      -0.1234,
      new Date(START)
    );
    expect(weather).toEqual({
      weather_temp_celsius: 9.4,
      weather_condition: 'Light rain',
      weather_wind_speed_mps: 3.3,
      weather_humidity_percentage: 86,
    });
  });

  it('rounds the coordinates before they leave the server', async () => {
    await fetchWeatherAt(PUBLIC_ENDPOINT, 51.5012, -0.1234, new Date(START));
    const [, config] = mockedGet.mock.calls[0]!;
    expect(config?.params).toMatchObject({
      latitude: '51.50',
      longitude: '-0.12',
      start_date: '2026-10-15',
      end_date: '2026-10-15',
      wind_speed_unit: 'ms',
    });
  });

  it('uses the forecast endpoint for a recent activity and the archive for an old one', async () => {
    await fetchWeatherAt(PUBLIC_ENDPOINT, 51.5, -0.12, new Date(START));
    expect(mockedGet.mock.calls[0]![0]).toBe(
      'https://api.open-meteo.com/v1/forecast'
    );

    await fetchWeatherAt(
      PUBLIC_ENDPOINT,
      51.5,
      -0.12,
      new Date('2026-09-01T07:25:00Z')
    );
    expect(mockedGet.mock.calls[1]![0]).toBe(
      'https://archive-api.open-meteo.com/v1/archive'
    );
  });

  it('maps the commercial host to its archive host and sends the key as apikey', async () => {
    const commercial = {
      url: 'https://customer-api.open-meteo.com/',
      apiKey: 'secret',
    };
    await fetchWeatherAt(commercial, 51.5, -0.12, new Date(START));
    await fetchWeatherAt(
      commercial,
      51.5,
      -0.12,
      new Date('2026-09-01T07:25:00Z')
    );
    expect(mockedGet.mock.calls[0]![0]).toBe(
      'https://customer-api.open-meteo.com/v1/forecast'
    );
    expect(mockedGet.mock.calls[1]![0]).toBe(
      'https://customer-archive-api.open-meteo.com/v1/archive'
    );
    expect(mockedGet.mock.calls[0]![1]?.params).toMatchObject({
      apikey: 'secret',
    });
  });

  it('serves forecast and archive from one self-hosted base and sends no key without one', async () => {
    const own = { url: 'http://weather.lan:8080/prefix' };
    await fetchWeatherAt(own, 51.5, -0.12, new Date(START));
    await fetchWeatherAt(own, 51.5, -0.12, new Date('2026-09-01T07:25:00Z'));
    expect(mockedGet.mock.calls[0]![0]).toBe(
      'http://weather.lan:8080/prefix/v1/forecast'
    );
    expect(mockedGet.mock.calls[1]![0]).toBe(
      'http://weather.lan:8080/prefix/v1/archive'
    );
    expect(mockedGet.mock.calls[0]![1]?.params).not.toHaveProperty('apikey');
  });

  it('does not follow redirects, and resolves names through the guard when one is given', async () => {
    const lookup = vi.fn();
    await fetchWeatherAt(
      { url: 'https://weather.example.com', lookup },
      51.5,
      -0.12,
      new Date(START)
    );
    const config = mockedGet.mock.calls[0]![1];
    expect(config?.maxRedirects).toBe(0);
    expect(config?.httpsAgent).toBeDefined();
  });

  it('returns null when the hour is missing, the body is unexpected or the call fails', async () => {
    expect(
      await fetchWeatherAt(
        PUBLIC_ENDPOINT,
        51.5,
        -0.12,
        new Date('2026-10-15T20:00:00Z')
      )
    ).toBeNull();

    mockedGet.mockResolvedValueOnce({ data: { nope: true } });
    expect(
      await fetchWeatherAt(PUBLIC_ENDPOINT, 51.5, -0.12, new Date(START))
    ).toBeNull();

    mockedGet.mockRejectedValueOnce(new Error('timeout'));
    expect(
      await fetchWeatherAt(PUBLIC_ENDPOINT, 51.5, -0.12, new Date(START))
    ).toBeNull();
  });
});

describe('attachWeatherToExerciseEntry', () => {
  const start = { lat: 51.5, lon: -0.12, t: START };

  it('stores the weather on an entry that has none', async () => {
    await attachWeatherToExerciseEntry('user-1', 'entry-1', start);
    expect(updateTelemetry).toHaveBeenCalledWith('entry-1', 'user-1', {
      weather_temp_celsius: 9.4,
      weather_condition: 'Light rain',
      weather_wind_speed_mps: 3.3,
      weather_humidity_percentage: 86,
    });
  });

  it('looks the provider up for the activity owner', async () => {
    await attachWeatherToExerciseEntry('user-1', 'entry-1', start);
    expect(resolveProvider).toHaveBeenCalledWith('user-1');
  });

  it('sends nothing when the person has no weather provider', async () => {
    resolveProvider.mockResolvedValue(null);
    await attachWeatherToExerciseEntry('user-1', 'entry-1', start);
    expect(getEntry).not.toHaveBeenCalled();
    expect(mockedGet).not.toHaveBeenCalled();
    expect(updateTelemetry).not.toHaveBeenCalled();
  });

  it('keeps weather a provider already supplied', async () => {
    getEntry.mockResolvedValue({
      id: 'entry-1',
      weather_condition: 'Sunny',
    });
    await attachWeatherToExerciseEntry('user-1', 'entry-1', start);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(updateTelemetry).not.toHaveBeenCalled();
  });

  it.each([
    ['a placeholder fix at 0,0', { lat: 0, lon: 0, t: START }],
    ['an impossible latitude', { lat: 95, lon: 10, t: START }],
    [
      'a start time in the future',
      { lat: 51.5, lon: -0.12, t: '2026-10-16T09:00:00Z' },
    ],
    ['an unreadable start time', { lat: 51.5, lon: -0.12, t: 'not a date' }],
  ])('skips %s', async (_label, bad) => {
    await attachWeatherToExerciseEntry('user-1', 'entry-1', bad);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(resolveProvider).not.toHaveBeenCalled();
  });

  it('never throws when the provider, the database or the lookup fails', async () => {
    resolveProvider.mockRejectedValueOnce(new Error('provider unreadable'));
    await expect(
      attachWeatherToExerciseEntry('user-1', 'entry-1', start)
    ).resolves.toBeUndefined();
    expect(mockedGet).not.toHaveBeenCalled();

    getEntry.mockRejectedValueOnce(new Error('db down'));
    await expect(
      attachWeatherToExerciseEntry('user-1', 'entry-1', start)
    ).resolves.toBeUndefined();

    updateTelemetry.mockRejectedValueOnce(new Error('write failed'));
    await expect(
      attachWeatherToExerciseEntry('user-1', 'entry-1', start)
    ).resolves.toBeUndefined();
  });
});
