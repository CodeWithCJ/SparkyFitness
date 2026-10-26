import { describe, expect, it } from 'vitest';
import {
  getFrontendSubPath,
  withPublicAuthPrefix,
  getSharedSsoRedirectUri,
} from '../utils/publicAuthUrl.js';

describe('getFrontendSubPath', () => {
  it('returns empty string when the frontend URL is unset', () => {
    expect(getFrontendSubPath(undefined)).toBe('');
  });

  it('returns empty string for a root deployment URL', () => {
    expect(getFrontendSubPath('https://homeserver.example.com')).toBe('');
  });

  it('returns empty string for a root deployment URL with a trailing slash', () => {
    expect(getFrontendSubPath('https://homeserver.example.com/')).toBe('');
  });

  it('extracts the sub-path from a sub-path deployment URL', () => {
    expect(getFrontendSubPath('https://homeserver.example.com/sparky')).toBe(
      '/sparky'
    );
  });

  it('strips a trailing slash from the extracted sub-path', () => {
    expect(getFrontendSubPath('https://homeserver.example.com/sparky/')).toBe(
      '/sparky'
    );
  });

  it('handles a frontend URL without an explicit protocol', () => {
    expect(getFrontendSubPath('homeserver.example.com/sparky')).toBe('/sparky');
  });

  it('returns empty string for an unparseable value', () => {
    expect(getFrontendSubPath('::not a url::')).toBe('');
  });
});

describe('withPublicAuthPrefix', () => {
  const generatedUrl =
    'https://homeserver.example.com/api/auth/reset-password/tok123?callbackURL=%2F';

  it('returns the URL unchanged when there is no sub-path', () => {
    expect(withPublicAuthPrefix(generatedUrl, '')).toBe(generatedUrl);
  });

  it('inserts the sub-path before the auth path', () => {
    expect(withPublicAuthPrefix(generatedUrl, '/sparky')).toBe(
      'https://homeserver.example.com/sparky/api/auth/reset-password/tok123?callbackURL=%2F'
    );
  });

  it('is idempotent when the URL is already prefixed', () => {
    const alreadyPrefixed =
      'https://homeserver.example.com/sparky/api/auth/reset-password/tok123';
    expect(withPublicAuthPrefix(alreadyPrefixed, '/sparky')).toBe(
      alreadyPrefixed
    );
  });

  it('returns the original string unchanged if it is not a parseable URL', () => {
    expect(withPublicAuthPrefix('not-a-url', '/sparky')).toBe('not-a-url');
  });
});

describe('getSharedSsoRedirectUri', () => {
  it('returns undefined when there is no sub-path, preserving the plugin default', () => {
    expect(
      getSharedSsoRedirectUri('https://homeserver.example.com', '')
    ).toBeUndefined();
  });

  it('builds the shared callback URL including the sub-path', () => {
    expect(
      getSharedSsoRedirectUri(
        'https://homeserver.example.com/sparky',
        '/sparky'
      )
    ).toBe('https://homeserver.example.com/sparky/api/auth/sso/callback');
  });

  it('returns undefined when the frontend URL cannot be parsed', () => {
    expect(getSharedSsoRedirectUri('::not a url::', '/sparky')).toBeUndefined();
  });

  it('returns undefined when the frontend URL is unset', () => {
    expect(getSharedSsoRedirectUri(undefined, '/sparky')).toBeUndefined();
  });
});
