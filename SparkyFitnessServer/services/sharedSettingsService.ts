import { isDeepStrictEqual } from 'node:util';

/** How long a different live instance count must hold before it becomes the expected count. */
export const MEMBERSHIP_GRACE_MS = 5 * 60_000;

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
