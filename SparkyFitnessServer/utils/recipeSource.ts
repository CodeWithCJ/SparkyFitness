import { z } from 'zod';
import {
  createGuardedFetch,
  PUBLIC_ONLY_AI_NETWORK_POLICY,
} from './outboundUrlPolicy.js';

export class RecipeSourceError extends Error {}
const MAX_SOURCE_BYTES = 1024 * 1024;
const guardedFetch = createGuardedFetch(PUBLIC_ONLY_AI_NETWORK_POLICY);
const recipeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  recipeIngredient: z.array(z.string().trim().min(1).max(2000)).min(1).max(100),
  recipeYield: z
    .union([
      z.string().max(200),
      z.number().positive(),
      z.array(z.string().max(200)).max(5),
    ])
    .optional(),
  recipeInstructions: z.unknown().optional(),
});

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function instructions(value: unknown, depth = 0): string[] {
  if (depth > 8) return [];
  if (typeof value === 'string') return [value.slice(0, 20000)];
  if (Array.isArray(value))
    return value.slice(0, 100).flatMap((item) => instructions(item, depth + 1));
  const item = record(value);
  if (!item) return [];
  if (typeof item.text === 'string') return [item.text.slice(0, 20000)];
  return instructions(item.itemListElement, depth + 1);
}

/** Extract source recipe cards verbatim; nutrition is resolved independently. */
export function extractRecipeCards(html: string) {
  if (Buffer.byteLength(html) > MAX_SOURCE_BYTES)
    throw new RecipeSourceError(
      'The recipe page is too large. Paste its ingredient list instead.'
    );
  const cards: Array<{
    name: string;
    ingredients: string[];
    yield: string | number | string[] | null;
    instructions: string;
  }> = [];
  let visited = 0;
  const walk = (value: unknown, depth = 0) => {
    if (++visited > 500 || depth > 8 || cards.length >= 10) return;
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((item) => walk(item, depth + 1));
      return;
    }
    const item = record(value);
    if (!item) return;
    const types = Array.isArray(item['@type'])
      ? item['@type']
      : [item['@type']];
    if (types.includes('Recipe')) {
      const parsed = recipeSchema.safeParse(item);
      if (parsed.success)
        cards.push({
          name: parsed.data.name,
          ingredients: parsed.data.recipeIngredient,
          yield: parsed.data.recipeYield ?? null,
          instructions: instructions(parsed.data.recipeInstructions)
            .join('\n')
            .slice(0, 20000),
        });
    }
    walk(item['@graph'], depth + 1);
    walk(item.mainEntity, depth + 1);
  };
  // Bound both page size and JSON traversal. Script bodies are data, never code.
  const scripts = html.matchAll(
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi
  );
  for (const match of scripts) {
    try {
      walk(JSON.parse(match[1]) as unknown);
    } catch {
      /* A malformed unrelated JSON-LD block does not discard other recipe cards. */
    }
  }
  return cards;
}

export async function readRecipeSource(
  url: string,
  fetchPage: typeof fetch = guardedFetch
) {
  let currentUrl = url;
  const signal = AbortSignal.timeout(10000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    let response: Response;
    try {
      response = await fetchPage(currentUrl, {
        redirect: 'manual',
        signal,
        headers: { Accept: 'text/html,application/ld+json,application/json' },
      });
    } catch {
      throw new RecipeSourceError(
        'The original recipe page could not be fetched. Use a public recipe URL, paste its ingredient list or attach its image.'
      );
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 3)
        throw new RecipeSourceError(
          'The recipe source redirects too many times. Use the original recipe page.'
        );
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new RecipeSourceError(
        'The original recipe page is unavailable. Paste the recipe or attach its image.'
      );
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (
      !/^(text\/html|application\/(ld\+json|json))/i.test(contentType) ||
      Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES
    ) {
      await response.body.cancel();
      throw new RecipeSourceError(
        'This URL does not contain a supported recipe page. Paste the recipe instead.'
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '',
      bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_SOURCE_BYTES)
          throw new RecipeSourceError(
            'The recipe page is too large. Paste its ingredient list instead.'
          );
        html += decoder.decode(chunk.value, { stream: true });
      }
      html += decoder.decode();
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const cards = /application\/(ld\+json|json)/i.test(contentType)
      ? extractRecipeCards(
          `<script type="application/ld+json">${html}</script>`
        )
      : extractRecipeCards(html);
    if (!cards.length)
      throw new RecipeSourceError(
        'No complete recipe card was found. Use web research to inspect the original recipe, or paste its ingredient list; do not invent missing ingredients or yield.'
      );
    return { source_url: currentUrl, cards };
  }
  throw new RecipeSourceError('The recipe source is unavailable.');
}
