import { describe, expect, it } from 'vitest';
import { getAuthEnvOverrides } from '../utils/authEnvOverrides.js';

describe('getAuthEnvOverrides', () => {
  it.each([
    [undefined, undefined, null],
    ['false', 'false', null],
    ['true', undefined, true],
    [undefined, 'true', false],
    ['true', 'true', true],
    ['false', 'true', false],
    ['true', 'false', true],
    ['TRUE', 'FALSE', null],
    ['', '', null],
    ['1', '1', null],
  ])('maps FORCE=%s and DISABLE=%s to %s', (force, disable, expected) => {
    const result = getAuthEnvOverrides({
      SPARKY_FITNESS_FORCE_EMAIL_LOGIN: force,
      SPARKY_FITNESS_DISABLE_EMAIL_LOGIN: disable,
    });

    expect(result.enable_email_password_login).toBe(expected);
  });

  it.each([
    [undefined, null],
    ['false', null],
    ['true', true],
    ['TRUE', null],
    ['', null],
    ['1', null],
  ])('maps OIDC_AUTH_ENABLED=%s to %s', (enabled, expected) => {
    expect(
      getAuthEnvOverrides({ SPARKY_FITNESS_OIDC_AUTH_ENABLED: enabled })
        .is_oidc_active
    ).toBe(expected);
  });

  it('does not carry an override into a later proposal after its removal', () => {
    const env = {
      SPARKY_FITNESS_FORCE_EMAIL_LOGIN: 'true',
      SPARKY_FITNESS_OIDC_AUTH_ENABLED: 'true',
    };
    expect(getAuthEnvOverrides(env)).toEqual({
      enable_email_password_login: true,
      is_oidc_active: true,
    });
    expect(getAuthEnvOverrides({})).toEqual({
      enable_email_password_login: null,
      is_oidc_active: null,
    });
    expect(env).toEqual({
      SPARKY_FITNESS_FORCE_EMAIL_LOGIN: 'true',
      SPARKY_FITNESS_OIDC_AUTH_ENABLED: 'true',
    });
  });
});
