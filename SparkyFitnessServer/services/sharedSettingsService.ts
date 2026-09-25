import { isDeepStrictEqual } from 'node:util';
import { log } from '../config/logging.js';
import {
  checkIn,
  getSharedSettings,
  joinMembers,
  withdrawMember,
} from '../models/sharedSettingsRepository.js';
import { getAuthEnvOverrides } from '../utils/authEnvOverrides.js';
import { getAppVersion } from './versionService.js';

/** How long a different live instance count must hold before it becomes the expected count. */
export const MEMBERSHIP_GRACE_MS = 5 * 60_000;
/** How often each instance renews its membership and re-checks agreement. */
export const HEARTBEAT_MS = 10_000;
/** How long a membership lasts without renewal: three missed heartbeats. */
export const MEMBER_EXPIRY_MS = 30_000;

const SHARED_GROUPS = ['identity'] as const;

export interface LiveMember {
  id: string;
  proposals: Record<string, unknown>;
}

export interface MembershipCount {
  expectedCount: number;
  pendingCount: number | null;
  pendingSince: Date | null;
}

export type GroupOutcome =
  | { group: string; status: 'save'; payload: unknown }
  | { group: string; status: 'unchanged' }
  | {
      group: string;
      status: 'waiting';
      reason: 'too-few-members' | 'missing-proposal' | 'disagreement';
    };

export interface AgreementInput {
  members: LiveMember[];
  membership: MembershipCount | null;
  accepted: Record<string, unknown>;
  groups: readonly string[];
  now: Date;
}

export interface AgreementResult {
  membership: MembershipCount;
  groups: GroupOutcome[];
}

/**
 * Decide the next expected instance count and which settings groups can be
 * saved, from one serialized snapshot of the live members.
 *
 * Every live member must propose identical settings for a group to change,
 * and there must be at least as many live members as expected. The expected
 * count follows the live count only after a different live count has held
 * steady for MEMBERSHIP_GRACE_MS, so a rolling-update surge never raises it
 * and a lone survivor cannot change settings straight after the others stop.
 * A saved group that no longer matches an agreed proposal is rewritten, which
 * also repairs a damaged row. No membership row yet means first start: the
 * current live members become the expected count.
 */
export function decideAgreement(input: AgreementInput): AgreementResult {
  const { members, accepted, groups, now } = input;
  if (members.length === 0) {
    throw new Error('Agreement needs at least the calling instance.');
  }
  const liveCount = members.length;
  const membership = nextMembership(input.membership, liveCount, now);
  const enoughMembers = liveCount >= membership.expectedCount;

  return {
    membership,
    groups: groups.map((group): GroupOutcome => {
      if (!enoughMembers) {
        return { group, status: 'waiting', reason: 'too-few-members' };
      }
      if (members.some((member) => !(group in member.proposals))) {
        return { group, status: 'waiting', reason: 'missing-proposal' };
      }
      const payload = members[0].proposals[group];
      if (
        members.some(
          (member) => !isDeepStrictEqual(member.proposals[group], payload)
        )
      ) {
        return { group, status: 'waiting', reason: 'disagreement' };
      }
      return isDeepStrictEqual(accepted[group], payload)
        ? { group, status: 'unchanged' }
        : { group, status: 'save', payload };
    }),
  };
}

/** Moves the expected count to a different live count once it has held for the grace period. */
function nextMembership(
  current: MembershipCount | null,
  liveCount: number,
  now: Date
): MembershipCount {
  if (!current || liveCount === current.expectedCount) {
    return { expectedCount: liveCount, pendingCount: null, pendingSince: null };
  }
  if (current.pendingCount !== liveCount || !current.pendingSince) {
    return { ...current, pendingCount: liveCount, pendingSince: now };
  }
  if (now.getTime() - current.pendingSince.getTime() >= MEMBERSHIP_GRACE_MS) {
    return { expectedCount: liveCount, pendingCount: null, pendingSince: null };
  }
  return current;
}

/** The shared settings this instance reads from its own environment. */
function currentProposals(): Record<string, unknown> {
  return { identity: getAuthEnvOverrides(process.env) };
}

let memberId: string | null = null;
let heartbeat: NodeJS.Timeout | null = null;
let inFlight: Promise<void> | null = null;
let stopped = false;
const lastStatus = new Map<string, string>();

/** Logs a group's outcome only when it changes, so a steady state stays quiet. */
function logOutcomes(result: AgreementResult): void {
  for (const outcome of result.groups) {
    const status =
      outcome.status === 'waiting' ? outcome.reason : outcome.status;
    if (lastStatus.get(outcome.group) === status) continue;
    lastStatus.set(outcome.group, status);
    if (outcome.status === 'waiting') {
      log(
        'warn',
        `[SHARED SETTINGS] ${outcome.group}: keeping saved settings (${outcome.reason}).`
      );
    } else if (outcome.status === 'save') {
      log('info', `[SHARED SETTINGS] ${outcome.group}: saved agreed settings.`);
    }
  }
}

/** Renews membership and applies agreement once, rejoining if the membership expired. */
async function checkInOnce(): Promise<void> {
  const proposals = currentProposals();
  const version = getAppVersion();
  const decide = (snapshot: Omit<AgreementInput, 'groups'>) =>
    decideAgreement({ ...snapshot, groups: SHARED_GROUPS });
  memberId ??= await joinMembers(version, proposals, MEMBER_EXPIRY_MS);
  let result = await checkIn(
    memberId,
    proposals,
    version,
    MEMBER_EXPIRY_MS,
    decide
  );
  if (!result && !stopped) {
    log('warn', '[SHARED SETTINGS] Membership expired; rejoining.');
    memberId = await joinMembers(version, proposals, MEMBER_EXPIRY_MS);
    result = await checkIn(
      memberId,
      proposals,
      version,
      MEMBER_EXPIRY_MS,
      decide
    );
  }
  if (result) logOutcomes(result);
}

/**
 * Joins the shared settings membership before the server starts serving.
 *
 * Checks in once and never waits: an all-in-one server saves its own settings
 * on that first check-in, and a group that has no saved record yet reads as
 * unset until every instance agrees, so a release that adds a group cannot
 * stall a rolling update. Afterwards a heartbeat renews membership in the
 * background; a failed heartbeat is logged and the server keeps serving the
 * settings it already has.
 */
async function startSharedSettings(): Promise<void> {
  stopped = false;
  await checkInOnce();
  const saved = await getSharedSettings();
  const unsaved = SHARED_GROUPS.filter((group) => !(group in saved));
  if (unsaved.length > 0) {
    log(
      'warn',
      `[SHARED SETTINGS] No agreed settings yet for ${unsaved.join(', ')}; treating them as unset until every instance agrees.`
    );
  }
  heartbeat = setInterval(() => {
    if (inFlight) return;
    inFlight = checkInOnce()
      .catch((error: unknown) =>
        log('error', '[SHARED SETTINGS] Check-in failed:', error)
      )
      .finally(() => {
        inFlight = null;
      });
  }, HEARTBEAT_MS);
  heartbeat.unref();
}

/** Stops the heartbeat and withdraws membership after the server has drained. */
async function stopSharedSettings(): Promise<void> {
  stopped = true;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  // A check-in already running may rejoin under a new ID; withdraw that one.
  await inFlight;
  const id = memberId;
  memberId = null;
  if (!id) return;
  try {
    await withdrawMember(id);
  } catch (error) {
    log('error', '[SHARED SETTINGS] Failed to withdraw membership:', error);
  }
}

export { startSharedSettings, stopSharedSettings };
