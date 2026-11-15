import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  challengePreset,
  type ChallengeDetail,
  type ChallengeStandingsResponse,
} from '@workspace/shared';
import { createMutationCache } from '@/lib/mutationCache';

export const CHALLENGE_ID = '11111111-1111-4111-8111-111111111111';
export const ME = 'user-me';
export const INVITE_CODE = 'AbCdEfGhIjKlMnOpQrStUv';

/** A stand-in for PreferencesContext with the formatters the pages use. */
export const preferences = {
  timezone: 'UTC',
  distanceUnit: 'km',
  energyUnit: 'kcal',
  getEnergyUnitString: () => 'kcal',
  formatDateInUserTimezone: (date: string, pattern = 'yyyy-MM-dd') =>
    format(parseISO(date), pattern),
  formatDate: (date: string) => format(parseISO(date), 'yyyy-MM-dd'),
};

export const challenge = (
  over: Partial<ChallengeDetail> = {}
): ChallengeDetail => ({
  id: CHALLENGE_ID,
  name: 'Office cup',
  description: null,
  emoji: null,
  template: 'all_rounder',
  rules: challengePreset('all_rounder').rules,
  start_date: '2026-10-19',
  end_date: null,
  time_zone: 'UTC',
  member_limit: 50,
  late_join: true,
  ended_at: null,
  is_host: true,
  member_count: 2,
  invite_active: false,
  invite_expires_at: null,
  members: [
    {
      user_id: ME,
      display_name: 'Test A',
      role: 'host',
      joined_at: '2026-10-19T08:00:00.000Z',
    },
    {
      user_id: 'user-b',
      display_name: 'Test B',
      role: 'member',
      joined_at: '2026-10-20T08:00:00.000Z',
    },
  ],
  ...over,
});

export const standings = (
  over: Partial<ChallengeStandingsResponse> = {}
): ChallengeStandingsResponse => ({
  challenge_id: CHALLENGE_ID,
  period_start: '2026-11-09',
  period_end: '2026-11-15',
  final: false,
  group_total: 210.5,
  group_reached: false,
  rows: [
    {
      user_id: 'user-b',
      display_name: 'Test B',
      rank: 1,
      total: 120.5,
      minutes: 95,
      winner: false,
      reached_on: null,
    },
    {
      user_id: ME,
      display_name: 'Test A',
      rank: 2,
      total: 90,
      minutes: 45,
      winner: false,
      me: true,
      reached_on: null,
    },
  ],
  ...over,
});

export const wrapper = () => {
  const client = new QueryClient({
    mutationCache: createMutationCache(),
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
};
