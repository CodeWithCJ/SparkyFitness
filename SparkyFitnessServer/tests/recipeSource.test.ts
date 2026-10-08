import { describe, expect, it, vi } from 'vitest';
import { extractRecipeCards, readRecipeSource } from '../utils/recipeSource.js';

const source = {
  '@type': 'Recipe',
  name: 'Test bread',
  recipeIngredient: ['250 g flour', 'Water as needed'],
  recipeYield: '2 loaves',
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Mix.' },
    { '@type': 'HowToSection', itemListElement: [{ text: 'Bake.' }] },
  ],
};
const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [source] })}</script>`;

describe('original recipe extraction', () => {
  it('rejects a private source URL before reading its page', async () => {
    await expect(readRecipeSource('http://127.0.0.1/recipe')).rejects.toThrow();
  });
  it('preserves all ingredients and the original yield without guessing a serving count', () => {
    expect(extractRecipeCards(html)).toEqual([
      {
        name: 'Test bread',
        ingredients: ['250 g flour', 'Water as needed'],
        yield: '2 loaves',
        instructions: 'Mix.\nBake.',
      },
    ]);
  });
  it('ignores malformed blocks and reads multiple source recipe cards separately', () => {
    expect(
      extractRecipeCards(
        `<script type='application/ld+json'>broken</script>${html}${html}`
      )
    ).toHaveLength(2);
  });
  it('does not execute page scripts or fill absent ingredients with guesses', () => {
    expect(
      extractRecipeCards('<script>throw new Error("execute")</script>')
    ).toEqual([]);
    expect(
      extractRecipeCards(
        `<script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Incomplete', recipeYield: 2 })}</script>`
      )
    ).toEqual([]);
  });
  it('bounds input size and rejects unsupported responses', async () => {
    expect(() => extractRecipeCards('x'.repeat(1024 * 1024 + 1))).toThrow(
      'too large'
    );
    const fetchPage = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('pdf', { headers: { 'Content-Type': 'application/pdf' } })
      );
    await expect(
      readRecipeSource('https://example.com/recipe', fetchPage)
    ).rejects.toThrow('supported recipe page');
  });
  it('fetches each redirect through the guarded boundary and retains the final original URL', async () => {
    const fetchPage = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: '/original' } })
      )
      .mockResolvedValueOnce(
        new Response(html, { headers: { 'Content-Type': 'text/html' } })
      );
    expect(
      (await readRecipeSource('https://example.com/recipe', fetchPage))
        .source_url
    ).toBe('https://example.com/original');
    expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([
      'https://example.com/recipe',
      'https://example.com/original',
    ]);
    expect(
      fetchPage.mock.calls.every(([, init]) => init?.redirect === 'manual')
    ).toBe(true);
  });
  it('stops a redirect loop without fetching forever', async () => {
    const fetchPage = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(null, { status: 302, headers: { Location: '/loop' } })
      );
    await expect(
      readRecipeSource('https://example.com/recipe', fetchPage)
    ).rejects.toThrow('redirects too many');
    expect(fetchPage).toHaveBeenCalledTimes(4);
  });
});
