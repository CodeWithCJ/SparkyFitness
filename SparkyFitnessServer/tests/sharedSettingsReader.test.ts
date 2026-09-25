import { describe, expect, it } from 'vitest';
import {
  readSharedGroup,
  SHARED_GROUP_SCHEMAS,
} from '../services/sharedSettingsService.js';
import { getAuthEnvOverrides } from '../utils/authEnvOverrides.js';

const schema = SHARED_GROUP_SCHEMAS.identity;
const identity = { enable_email_password_login: false, is_oidc_active: true };
const lastGood = { enable_email_password_login: true, is_oidc_active: null };
const unset = { enable_email_password_login: null, is_oidc_active: null };

describe('readSharedGroup', () => {
  it('reads a group with no saved record as unset', () => {
    expect(readSharedGroup(schema, undefined, '1.8.0', null)).toEqual({
      status: 'ok',
      settings: unset,
      unknownFields: [],
    });
  });

  it('reads a complete record', () => {
    const saved = { payload: identity, releaseVersion: '1.8.0' };

    expect(readSharedGroup(schema, saved, '1.8.0', null)).toEqual({
      status: 'ok',
      settings: identity,
      unknownFields: [],
    });
  });

  it('reads a field an older release did not write as unset', () => {
    const saved = {
      payload: { enable_email_password_login: false },
      releaseVersion: '1.7.2',
    };

    expect(readSharedGroup(schema, saved, '1.8.0', null)).toEqual({
      status: 'ok',
      settings: { enable_email_password_login: false, is_oidc_active: null },
      unknownFields: [],
    });
  });

  it('ignores and reports a field a newer release wrote', () => {
    const saved = {
      payload: { ...identity, disable_passkey_login: true },
      releaseVersion: '1.9.0',
    };

    expect(readSharedGroup(schema, saved, '1.8.0', null)).toEqual({
      status: 'ok',
      settings: identity,
      unknownFields: ['disable_passkey_login'],
    });
  });

  it('keeps the last good settings when this release wrote an incomplete record', () => {
    const saved = {
      payload: { enable_email_password_login: false },
      releaseVersion: '1.8.0',
    };

    expect(readSharedGroup(schema, saved, '1.8.0', lastGood)).toEqual({
      status: 'invalid',
      settings: lastGood,
      unknownFields: [],
    });
  });

  it('has nothing to fall back to without last good settings', () => {
    const saved = { payload: {}, releaseVersion: '1.8.0' };

    expect(readSharedGroup(schema, saved, '1.8.0', null)).toMatchObject({
      status: 'invalid',
      settings: null,
    });
  });

  it.each([
    ['a wrongly typed field', { ...identity, is_oidc_active: false }],
    ['a non-object payload', ['not', 'settings']],
    ['a null payload', null],
  ])('treats %s as damaged', (_label, payload) => {
    const saved = { payload, releaseVersion: '1.7.2' };

    expect(readSharedGroup(schema, saved, '1.8.0', lastGood)).toMatchObject({
      status: 'invalid',
      settings: lastGood,
    });
  });
});

describe('SHARED_GROUP_SCHEMAS', () => {
  it.each(Object.entries(SHARED_GROUP_SCHEMAS))(
    'lets every %s field be unset',
    (_group, groupSchema) => {
      const allUnset = Object.fromEntries(
        Object.keys(groupSchema.shape).map((field) => [field, null])
      );

      expect(groupSchema.safeParse(allUnset).success).toBe(true);
    }
  );

  it.each([
    [{}],
    [{ SPARKY_FITNESS_FORCE_EMAIL_LOGIN: 'true' }],
    [{ SPARKY_FITNESS_DISABLE_EMAIL_LOGIN: 'true' }],
    [{ SPARKY_FITNESS_OIDC_AUTH_ENABLED: 'true' }],
    [{ SPARKY_FITNESS_OIDC_AUTH_ENABLED: 'false' }],
  ])('accepts the identity proposal built from %o', (env) => {
    expect(schema.safeParse(getAuthEnvOverrides(env)).success).toBe(true);
  });
});
