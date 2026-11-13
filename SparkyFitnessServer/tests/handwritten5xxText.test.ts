import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

// Routes that answer their own 5xx instead of passing the error to the shared
// error handler have to hide database and system text themselves, through
// publicErrorMessage. This reads every route file and accepts a 5xx body only
// when each value is a literal or a publicErrorMessage call, so an alias such
// as `error: result.error` can't slip past a list of known spellings.
const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCANNED_DIRS = ['routes', 'integrations'];

// Responses that send their own error text on purpose, with how many each
// file has. Adding one means adding it here, where review can see it.
const ALLOWED: Record<string, { count: number; reason: string }> = {
  'routes/aiUnitConversionRoutes.ts': {
    count: 1,
    reason:
      'the 502 carries the AI service detail the person needs to fix their own AI settings',
  },
  'routes/backupRoutes.ts': {
    count: 8,
    reason: 'admin only; a failed backup or restore has to say why',
  },
  'routes/oidcSettingsRoutes.ts': {
    count: 2,
    reason: 'admin only; a rejected OIDC provider has to say why',
  },
};

const LITERAL_VALUES = new Set(['true', 'false', 'null', 'undefined']);

/** The non-literal values a `.status(5xx)...;` statement sends as its body. */
function dynamicBodyValues(response: string): string[] {
  const code = response
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`[^`$]*`/g, "''")
    // Only with no fallback or a literal one: a dynamic fallback is sent as is.
    .replace(/publicErrorMessage\(\s*[\w$.]+\s*(?:,\s*'')?\s*\)/g, "''");
  const body = code.match(/\.(?:json|send)\(([\s\S]*)$/)?.[1];
  if (body === undefined) return [];
  return (
    body.replace(/[\w$]+\s*:/g, ':').match(/[A-Za-z_$][\w$.]*/g) ?? []
  ).filter((value) => !LITERAL_VALUES.has(value));
}

/** Every `.status(5xx)...;` statement in the source. */
function serverErrorResponses(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/\.status\(5\d\d\)/g)) {
    let depth = 0;
    let end = match.index;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ';' && depth === 0) break;
    }
    found.push(source.slice(match.index, end));
  }
  return found;
}

function sourceFiles(): string[] {
  return SCANNED_DIRS.flatMap((dir) =>
    fs
      .readdirSync(path.join(serverDir, dir), { recursive: true })
      .map((entry) => path.join(dir, String(entry)).split(path.sep).join('/'))
      .filter((file) => file.endsWith('.ts'))
  ).sort();
}

const leaks = new Map<string, number>();
for (const file of sourceFiles()) {
  const source = fs.readFileSync(path.join(serverDir, file), 'utf8');
  const count = serverErrorResponses(source).filter(
    (response) => dynamicBodyValues(response).length > 0
  ).length;
  if (count > 0) leaks.set(file, count);
}

describe('hand-written 5xx responses', () => {
  it.each([
    'res.status(500).json({ error: error.message })',
    "res.status(500).json({ message: 'Failed', error: errorMessage })",
    'res.status(500).json({ error: result.error })',
    'res.status(502).json({ error })',
    'res.status(500).json(result)',
    'res.status(500).send(String(err))',
    'res.status(500).json({ error: publicErrorMessage(error, error.message) })',
  ])('flags %s', (response) => {
    expect(dynamicBodyValues(response)).not.toEqual([]);
  });

  it.each([
    "res.status(500).json({ error: 'Failed to fetch' })",
    "res.status(500).json({ message: 'Failed', error: publicErrorMessage(error) })",
    "res.status(500).json({ error: publicErrorMessage(error, 'Sync failed.') })",
    "res.status(503).json({ ok: false, code: 'DB_DOWN' })",
    'res.status(500).end()',
  ])('accepts %s', (response) => {
    expect(dynamicBodyValues(response)).toEqual([]);
  });

  it('scans the route files', () => {
    expect(sourceFiles()).toContain('routes/ouraRoutes.ts');
    expect(sourceFiles()).toContain(
      'integrations/healthData/healthDataRoutes.ts'
    );
  });

  it('send raw error text only where allowed', () => {
    expect(Object.fromEntries(leaks)).toEqual(
      Object.fromEntries(
        Object.entries(ALLOWED).map(([file, { count }]) => [file, count])
      )
    );
  });
});
