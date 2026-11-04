import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/backupSettingsRepository.js', () => ({ default: {} }));

import { skipStatementsThisInstallCannotRun } from '../services/backupService.js';

const ROLES = {
  existing: new Set(['sparky', 'sparky_app', 'Mixed Case', 'postgres']),
  actAs: new Set(['sparky']),
};

async function filter(chunks: Array<string | Buffer>): Promise<string> {
  async function* source() {
    for (const chunk of chunks) yield Buffer.from(chunk);
  }
  let out = '';
  for await (const piece of skipStatementsThisInstallCannotRun(ROLES)(
    source()
  )) {
    out += piece;
  }
  return out;
}

const lines = (...all: string[]) => all.map((line) => `${line}\n`).join('');

describe('skipStatementsThisInstallCannotRun', () => {
  it('drops ownership and the statements only a superuser may run', async () => {
    expect(
      await filter([
        lines(
          'ALTER SCHEMA public OWNER TO postgres;',
          "COMMENT ON SCHEMA public IS 'standard public schema';",
          'CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;',
          "COMMENT ON EXTENSION pg_stat_statements IS 'track statistics';",
          'CREATE TABLE public.t (v text);',
          'ALTER TABLE public.t OWNER TO sparky;',
          'ALTER FUNCTION public.f() OWNER TO someone_else;'
        ),
      ])
    ).toBe(lines('CREATE TABLE public.t (v text);'));
  });

  it('drops grants and revokes naming a role this install lacks or the restoring user cannot act for, keeping the rest', async () => {
    expect(
      await filter([
        lines(
          'GRANT SELECT ON TABLE public.t TO sparky_app;',
          'GRANT SELECT ON TABLE public.t TO other_app;',
          'GRANT ALL ON TABLE public.t TO sparky_app, other_app WITH GRANT OPTION;',
          'REVOKE ALL ON TABLE public.t FROM PUBLIC;',
          'REVOKE ALL ON TABLE public.t FROM other_app;',
          'GRANT USAGE ON SCHEMA public TO "Mixed Case";',
          'GRANT USAGE ON SCHEMA public TO mixed_case;',
          'ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT ON TABLES TO sparky_app;',
          'ALTER DEFAULT PRIVILEGES FOR ROLE old_owner IN SCHEMA public GRANT SELECT ON TABLES TO sparky_app;',
          'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO sparky_app;',
          'GRANT SELECT ON TABLE public.t TO sparky_app GRANTED BY postgres;',
          'GRANT SELECT ON TABLE public.t TO sparky_app GRANTED BY sparky;'
        ),
      ])
    ).toBe(
      lines(
        'GRANT SELECT ON TABLE public.t TO sparky_app;',
        'REVOKE ALL ON TABLE public.t FROM PUBLIC;',
        'GRANT USAGE ON SCHEMA public TO "Mixed Case";',
        'ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT ON TABLES TO sparky_app;',
        'GRANT SELECT ON TABLE public.t TO sparky_app GRANTED BY sparky;'
      )
    );
  });

  it('never drops a COPY data row, even one that reads like a skipped statement', async () => {
    const dump = lines(
      'COPY public.t (v) FROM stdin;',
      'ALTER SCHEMA public OWNER TO postgres;',
      'GRANT SELECT ON TABLE public.t TO other_app;',
      '\\.',
      'ALTER SCHEMA public OWNER TO postgres;'
    );

    expect(await filter([dump])).toBe(
      lines(
        'COPY public.t (v) FROM stdin;',
        'ALTER SCHEMA public OWNER TO postgres;',
        'GRANT SELECT ON TABLE public.t TO other_app;',
        '\\.'
      )
    );
  });

  it('handles lines and multi-byte characters split across chunks', async () => {
    const bytes = Buffer.from(
      "INSERT INTO t VALUES ('café');\nALTER TABLE t OWNER TO x;\nSELECT 1;"
    );
    const cut = bytes.indexOf(Buffer.from('é')) + 1;

    expect(
      await filter([
        bytes.subarray(0, cut),
        bytes.subarray(cut, cut + 20),
        bytes.subarray(cut + 20),
      ])
    ).toBe("INSERT INTO t VALUES ('café');\nSELECT 1;");
  });
});
