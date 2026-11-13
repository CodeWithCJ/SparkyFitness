import { describe, expect, it } from 'vitest';
import { actionTagUrl, tagCodeFromUrl } from '@workspace/shared';

const CODE = '0123456789abcdef0123456789abcdef';

describe('action tag link', () => {
  it('builds the sticker link on the project domain', () => {
    expect(actionTagUrl(CODE)).toBe(`https://tag.sparkyfitness.com/t/${CODE}`);
  });

  it('reads the code back from its own link', () => {
    expect(tagCodeFromUrl(actionTagUrl(CODE))).toBe(CODE);
  });

  it('accepts a trailing slash, a query string and a different host case', () => {
    expect(tagCodeFromUrl(`https://TAG.sparkyfitness.com/t/${CODE}/`)).toBe(
      CODE
    );
    expect(tagCodeFromUrl(`https://tag.sparkyfitness.com/t/${CODE}?x=1`)).toBe(
      CODE
    );
  });

  it('rejects other hosts, schemes, paths and malformed codes', () => {
    expect(tagCodeFromUrl(`https://evil.example/t/${CODE}`)).toBeNull();
    expect(
      tagCodeFromUrl(`https://tag.sparkyfitness.com.evil.example/t/${CODE}`)
    ).toBeNull();
    expect(tagCodeFromUrl(`http://tag.sparkyfitness.com/t/${CODE}`)).toBeNull();
    expect(
      tagCodeFromUrl(`sparkyfitnessmobile://tag.sparkyfitness.com/t/${CODE}`)
    ).toBeNull();
    expect(
      tagCodeFromUrl(`https://tag.sparkyfitness.com/x/${CODE}`)
    ).toBeNull();
    expect(tagCodeFromUrl('https://tag.sparkyfitness.com/t/short')).toBeNull();
    expect(
      tagCodeFromUrl(`https://tag.sparkyfitness.com/t/${CODE.toUpperCase()}`)
    ).toBeNull();
    expect(tagCodeFromUrl('not a url')).toBeNull();
  });
});
