import { describe, expect, it } from 'vitest';
import {
  resolveGlp1Profile,
  eliminationRate,
  serumLevelAt,
  simulateSerumCurve,
  suggestNextSite,
  INJECTION_SITES,
  SITE_REST_DAYS,
  type DoseEvent,
} from '@workspace/shared';

describe('GLP-1 PK helpers', () => {
  it('resolves a profile by id and by brand name', () => {
    expect(resolveGlp1Profile('semaglutide')?.id).toBe('semaglutide');
    expect(resolveGlp1Profile('Wegovy')?.id).toBe('semaglutide');
    expect(resolveGlp1Profile('Mounjaro')?.id).toBe('tirzepatide');
    expect(resolveGlp1Profile('not-a-drug')).toBeUndefined();
  });

  it('derives elimination rate from half-life (ln2 / t½)', () => {
    expect(eliminationRate(7)).toBeCloseTo(Math.LN2 / 7, 6);
  });

  it('serum level is zero before the first dose and positive after', () => {
    const profile = { halfLifeDays: 7, tMaxDays: 1.5 };
    const doses: DoseEvent[] = [{ day: 0, doseMg: 1 }];
    expect(serumLevelAt(-1, doses, profile)).toBe(0);
    expect(serumLevelAt(2, doses, profile)).toBeGreaterThan(0);
  });

  it('single-dose curve peaks near tMax then declines', () => {
    const profile = { halfLifeDays: 7, tMaxDays: 1.5 };
    const curve = simulateSerumCurve(
      [{ day: 0, doseMg: 1 }],
      profile,
      0,
      14,
      0.25
    );
    const peak = curve.reduce((m, p) => (p.level > m.level ? p : m), curve[0]);
    // peak should be in the first few days (absorption), not at the very end
    expect(peak.day).toBeGreaterThan(0);
    expect(peak.day).toBeLessThan(5);
    // fraction is normalized so the peak is 1
    expect(peak.fraction).toBeCloseTo(1, 5);
    // tail is lower than the peak
    expect(curve[curve.length - 1].level).toBeLessThan(peak.level);
  });

  it('weekly dosing accumulates above a single dose', () => {
    const profile = { halfLifeDays: 7, tMaxDays: 1.5 };
    const single = serumLevelAt(21, [{ day: 21, doseMg: 1 }], profile);
    const weekly = serumLevelAt(
      21,
      [0, 7, 14, 21].map((d) => ({ day: d, doseMg: 1 })),
      profile
    );
    expect(weekly).toBeGreaterThan(single);
  });
});

describe('GLP-1 injection site rotation', () => {
  it('suggests a never-used site when some sites are fresh', () => {
    const recent = [{ siteId: 'left_thigh', daysAgo: 1 }];
    const result = suggestNextSite(recent);
    expect(result.suggestedSiteId).not.toBe('left_thigh');
    expect(INJECTION_SITES.map((s) => s.id)).toContain(result.suggestedSiteId);
  });

  it('flags sites used within the rest window as resting', () => {
    const recent = [
      { siteId: 'left_thigh', daysAgo: 2 },
      { siteId: 'right_thigh', daysAgo: 10 },
    ];
    const result = suggestNextSite(recent);
    expect(result.restingSiteIds).toContain('left_thigh');
    expect(result.restingSiteIds).not.toContain('right_thigh');
  });

  it('rest window matches SITE_REST_DAYS', () => {
    expect(SITE_REST_DAYS).toBe(7);
  });
});

describe('GLP-1 granular sites + ordered rotation', () => {
  it('exposes the granular site set (stomach quadrants, hips, unknown)', () => {
    const ids = INJECTION_SITES.map((s) => s.id);
    expect(ids).toContain('stomach_upper_left');
    expect(ids).toContain('stomach_lower_right');
    expect(ids).toContain('stomach_mid_left');
    expect(ids).toContain('left_hip');
    expect(ids).toContain('right_hip');
    expect(ids).toContain('unknown');
    expect(INJECTION_SITES.length).toBeGreaterThanOrEqual(15);
    // every site carries an svgClass used by the body map
    expect(INJECTION_SITES.every((s) => typeof s.svgClass === 'string')).toBe(
      true
    );
  });

  it('never suggests the "unknown" placeholder site', () => {
    expect(suggestNextSite([]).suggestedSiteId).not.toBe('unknown');
  });

  it('rotates forward through the user-provided active order', () => {
    const active = ['left_thigh', 'right_thigh', 'left_arm'];
    // just used the first site → suggest the next one in the ordered list
    const result = suggestNextSite(
      [{ siteId: 'left_thigh', daysAgo: 0 }],
      active
    );
    expect(result.suggestedSiteId).toBe('right_thigh');
    expect(result.restingSiteIds).toContain('left_thigh');
  });

  it('falls back to the longest-rested site when every active site is resting', () => {
    const active = ['left_thigh', 'right_thigh'];
    const result = suggestNextSite(
      [
        { siteId: 'left_thigh', daysAgo: 1 },
        { siteId: 'right_thigh', daysAgo: 5 },
      ],
      active
    );
    // both within the 7-day window → pick the one rested longest (right_thigh)
    expect(result.suggestedSiteId).toBe('right_thigh');
    expect(result.restingSiteIds).toEqual(
      expect.arrayContaining(['left_thigh', 'right_thigh'])
    );
  });
});
