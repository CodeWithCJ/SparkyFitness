import { describe, expect, it } from 'vitest';
import {
  decideAgreement,
  MEMBERSHIP_GRACE_MS,
  type AgreementInput,
  type LiveMember,
  type MembershipCount,
} from '../services/sharedSettingsService.js';

const start = new Date('2026-09-24T12:00:00Z');
/** A moment the given number of milliseconds after the test start. */
const later = (ms: number) => new Date(start.getTime() + ms);
const identity = { enable_email_password_login: null, is_oidc_active: true };

/** Live members that all propose the same settings. */
function members(
  count: number,
  proposals: Record<string, unknown> = { identity }
): LiveMember[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `member-${i}`,
    proposals,
  }));
}

/** A membership row with no differing live count being timed. */
function steady(expectedCount: number): MembershipCount {
  return { expectedCount, pendingCount: null, pendingSince: null };
}

/** Decides from three steady, agreeing members by default; each test overrides what it needs. */
function decide(overrides: Partial<AgreementInput>) {
  return decideAgreement({
    members: members(3),
    membership: steady(3),
    accepted: { identity },
    groups: ['identity'],
    now: start,
    ...overrides,
  });
}

describe('decideAgreement', () => {
  it('lets a lone first instance agree with itself', () => {
    const result = decide({
      members: members(1),
      membership: null,
      accepted: {},
    });

    expect(result.membership).toEqual(steady(1));
    expect(result.groups).toEqual([
      { group: 'identity', status: 'save', payload: identity },
    ]);
  });

  it('leaves matching saved settings unchanged', () => {
    expect(decide({}).groups).toEqual([
      { group: 'identity', status: 'unchanged' },
    ]);
  });

  it('keeps saved settings while one member disagrees', () => {
    const changed = { ...identity, is_oidc_active: null };
    const result = decide({
      members: [...members(2, { identity: changed }), ...members(1)],
    });

    expect(result.groups).toEqual([
      { group: 'identity', status: 'waiting', reason: 'disagreement' },
    ]);
  });

  it('waits while a member does not propose the group yet', () => {
    const result = decide({
      members: [...members(2), { id: 'older-release', proposals: {} }],
    });

    expect(result.groups).toEqual([
      { group: 'identity', status: 'waiting', reason: 'missing-proposal' },
    ]);
  });

  it('saves a change once every member proposes it', () => {
    const changed = { ...identity, is_oidc_active: null };
    const result = decide({ members: members(3, { identity: changed }) });

    expect(result.groups).toEqual([
      { group: 'identity', status: 'save', payload: changed },
    ]);
  });

  it('ignores key order when comparing proposals', () => {
    const reordered = {
      is_oidc_active: true,
      enable_email_password_login: null,
    };
    const result = decide({
      members: [
        ...members(2),
        { id: 'reordered', proposals: { identity: reordered } },
      ],
    });

    expect(result.groups).toEqual([{ group: 'identity', status: 'unchanged' }]);
  });

  it('rewrites a damaged saved row when members agree', () => {
    const result = decide({ accepted: { identity: { is_oidc_active: true } } });

    expect(result.groups).toEqual([
      { group: 'identity', status: 'save', payload: identity },
    ]);
  });

  it('decides each group independently', () => {
    const smtp = { host: 'mail.example.test' };
    const result = decide({
      members: [
        ...members(2, { identity, smtp }),
        { id: 'other-mail', proposals: { identity, smtp: { host: 'other' } } },
      ],
      accepted: {},
      groups: ['identity', 'smtp'],
    });

    expect(result.groups).toEqual([
      { group: 'identity', status: 'save', payload: identity },
      { group: 'smtp', status: 'waiting', reason: 'disagreement' },
    ]);
  });

  describe('expected instance count', () => {
    it('does not raise the count during a rolling-update surge', () => {
      const result = decide({ members: members(4) });

      expect(result.membership).toEqual({
        expectedCount: 3,
        pendingCount: 4,
        pendingSince: start,
      });
      expect(result.groups[0].status).toBe('unchanged');
    });

    it('clears the pending count when the surge ends', () => {
      const result = decide({
        membership: { expectedCount: 3, pendingCount: 4, pendingSince: start },
        now: later(60_000),
      });

      expect(result.membership).toEqual(steady(3));
    });

    it('raises the count after a larger group holds for the grace period', () => {
      const result = decide({
        members: members(5),
        membership: { expectedCount: 3, pendingCount: 5, pendingSince: start },
        now: later(MEMBERSHIP_GRACE_MS),
      });

      expect(result.membership).toEqual(steady(5));
    });

    it('holds settings while fewer members than expected remain', () => {
      const changed = { ...identity, is_oidc_active: null };
      const result = decide({
        members: members(1, { identity: changed }),
        now: later(60_000),
      });

      expect(result.membership).toEqual({
        expectedCount: 3,
        pendingCount: 1,
        pendingSince: later(60_000),
      });
      expect(result.groups).toEqual([
        { group: 'identity', status: 'waiting', reason: 'too-few-members' },
      ]);
    });

    it('lets a smaller group agree after the grace period', () => {
      const changed = { ...identity, is_oidc_active: null };
      const result = decide({
        members: members(1, { identity: changed }),
        membership: { expectedCount: 3, pendingCount: 1, pendingSince: start },
        now: later(MEMBERSHIP_GRACE_MS),
      });

      expect(result.membership).toEqual(steady(1));
      expect(result.groups).toEqual([
        { group: 'identity', status: 'save', payload: changed },
      ]);
    });

    it('restarts the grace period when the live count changes again', () => {
      const result = decide({
        members: members(1),
        membership: { expectedCount: 3, pendingCount: 2, pendingSince: start },
        now: later(MEMBERSHIP_GRACE_MS),
      });

      expect(result.membership).toEqual({
        expectedCount: 3,
        pendingCount: 1,
        pendingSince: later(MEMBERSHIP_GRACE_MS),
      });
      expect(result.groups[0]).toMatchObject({ reason: 'too-few-members' });
    });
  });

  it('requires the calling instance among the members', () => {
    expect(() => decide({ members: [] })).toThrow();
  });
});
