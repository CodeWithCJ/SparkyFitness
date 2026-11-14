import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  chatArgsPreview,
  chatPreviewValue,
  chatApprovalDescriptionKey,
  chatApprovalState,
  chatServerList,
  outsideToolResult,
} from '@workspace/shared';
it('cleans outside wrappers and suggestions, distinguishes tool errors from success', () => {
  expect(
    outsideToolResult(
      '<outside_tool_result server="Notes" tool="read">\nhello\n</outside_tool_result>'
    )
  ).toEqual({ text: 'hello', isError: false, code: undefined });
  expect(
    outsideToolResult(
      '<outside_tool_result server="Notes">\nError [EXTERNAL_TOOL_UNAVAILABLE]: offline\n\nSuggestion: retry\n</outside_tool_result>'
    )
  ).toEqual({
    text: 'Error [EXTERNAL_TOOL_UNAVAILABLE]: offline',
    isError: true,
    code: 'unavailable',
  });
  expect(
    outsideToolResult(
      'Error [FORBIDDEN]: The user has not turned this server on for chat. Do not retry.'
    ).code
  ).toBe('turnedOff');
});
it('previews three scalar arguments, omitting action and nested JSON', () => {
  expect(
    chatArgsPreview(
      {
        action: 'log_water',
        entry_date: `${new Date().getFullYear()}-11-13`,
        amount: 250,
        unit: 'ml',
        nested: { secret: true },
        extra: 2,
      },
      'en-US'
    )
  ).toBe('Entry date: Nov 13 · Amount: 250 · Unit: ml');
});
it('formats server names as a distinct natural-language list', () => {
  expect(chatServerList(['Notes', 'Mail', 'Notes'], 'en')).toBe(
    'Notes and Mail'
  );
});

it('does not label an expired unresolved approval as allowed', () => {
  const state = chatApprovalState(
    { resolution: 'expired' },
    undefined,
    undefined,
    false,
    false
  );
  expect(state.pending).toBe(false);
  expect(state.title).toBe('notRun');
  expect(state.status).toBeUndefined();
});

it('formats calendar dates in the locale without moving the day, retaining older years', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  expect(chatPreviewValue('2026-01-02', 'en-US', now)).toBe('Jan 2');
  expect(chatPreviewValue('2025-01-02', 'en-US', now)).toBe('Jan 2, 2025');
  expect(chatPreviewValue('2026-01-02', 'fr-FR', now)).toBe('2 janv.');
  expect(chatPreviewValue('2026-02-30', 'en-US', now)).toBe('2026-02-30');
  expect(chatPreviewValue('2026-01-02T00:00:00Z', 'en-US', now)).toBe(
    '2026-01-02T00:00:00Z'
  );
});

const catalogs = [
  '../SparkyFitnessFrontend/public/locales/en/translation.json',
  '../SparkyFitnessMobile/src/localization/locales/en/translation.json',
].map(
  (path) =>
    JSON.parse(
      readFileSync(new URL(path, new URL('../', import.meta.url)), 'utf8')
    ) as {
      chat: { tools: Record<string, string>; approval: Record<string, string> };
    }
);
it('has every tool-label key requested by the shared helper in both English catalogs', () => {
  const helper = readFileSync(
    new URL('../../shared/src/utils/chatTools.ts', import.meta.url),
    'utf8'
  );
  const keys = [
    ...new Set(
      [...helper.matchAll(/'chat\.tools\.([^']+)'/g)].map((match) => match[1])
    ),
  ];
  expect(keys.length).toBeGreaterThan(5);
  for (const key of keys) {
    for (const catalog of catalogs)
      expect(catalog.chat.tools[key]).toBeTruthy();
    expect(catalogs[0]?.chat.tools[key]).toBe(catalogs[1]?.chat.tools[key]);
  }
});
it.each([
  'run',
  'runPlain',
  'send',
  'delete',
  'deleteAfter',
  'change',
  'changeAfter',
] as const)(
  'uses whole sentences in the right tense for %s on both platforms',
  (variant) => {
    for (const [state, expected] of [
      [
        { pending: true, working: false, failed: false, title: 'title' },
        'wants to',
      ],
      [
        { pending: false, working: true, failed: false, title: 'allowed' },
        'wants to',
      ],
      [
        { pending: false, working: false, failed: false, title: 'allowed' },
        // A delete or change tool can answer "are you sure?" without acting,
        // so these say what was allowed, not what happened.
        /^(delete|change)/.test(variant) ? 'allowed' : 'ran',
      ],
      [
        { pending: false, working: false, failed: true, title: 'toolFailed' },
        'tried to',
      ],
      [
        { pending: false, working: false, failed: false, title: 'denied' },
        'wanted to',
      ],
      [
        { pending: false, working: false, failed: false, title: 'notRun' },
        'wanted to',
      ],
    ] as const) {
      const key = chatApprovalDescriptionKey(variant, state).replace(
        'chat.approval.',
        ''
      );
      for (const catalog of catalogs) {
        expect(catalog.chat.approval[key]).toContain(expected);
        // The phone app ends with a colon: what runs follows on its own line.
        expect(catalog.chat.approval[key]).toMatch(/[.:]$/);
      }
    }
  }
);
