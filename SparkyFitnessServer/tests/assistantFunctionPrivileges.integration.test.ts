/** Opt-in test for the disposable PR-review database, never a user's database. */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
const enabled =
  process.env.RUN_PR_PERMISSION_TESTS === '1' &&
  process.env.SPARKY_FITNESS_DB_NAME === 'sparky_pr_validation';
describe.runIf(enabled)(
  'assistant dependency helper execution privileges',
  () => {
    const connection = {
      host: process.env.SPARKY_FITNESS_DB_HOST,
      port: Number(process.env.SPARKY_FITNESS_DB_PORT),
      database: process.env.SPARKY_FITNESS_DB_NAME,
    };
    const owner = new pg.Client({
      ...connection,
      user: process.env.SPARKY_FITNESS_DB_USER,
      password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    });
    const app = new pg.Client({
      ...connection,
      user: process.env.SPARKY_FITNESS_APP_DB_USER,
      password: process.env.SPARKY_FITNESS_APP_DB_PASSWORD,
    });
    const role = `pr_untrusted_${randomUUID().replace(/-/g, '')}`;
    const signatures = [
      'public.assistant_recipe_has_dependants(uuid)',
      'public.assistant_plan_has_external_dependants(uuid)',
      'public.assistant_food_has_dependants(uuid,uuid)',
    ];
    beforeAll(async () => {
      await owner.connect();
      await app.connect();
      await owner.query(`CREATE ROLE "${role}" NOLOGIN`);
      await owner.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    });
    afterAll(async () => {
      await owner.query('RESET ROLE');
      await owner.query(`REVOKE USAGE ON SCHEMA public FROM "${role}"`);
      await owner.query(`DROP ROLE "${role}"`);
      await app.end();
      await owner.end();
    });
    it.each(signatures)(
      'keeps the configured application role authorized for %s',
      async (signature) => {
        const result = await app.query(
          'SELECT has_function_privilege(current_user, $1, $2) AS allowed',
          [signature, 'EXECUTE']
        );
        expect(result.rows[0].allowed).toBe(true);
      }
    );
    it.each(signatures)(
      'denies unrelated roles even with a spoofed application actor for %s',
      async (signature) => {
        const privileges = await owner.query(
          'SELECT has_function_privilege($1, $2, $3) AS allowed',
          [role, signature, 'EXECUTE']
        );
        expect(privileges.rows[0].allowed).toBe(false);
        await owner.query(`SET ROLE "${role}"`);
        try {
          await owner.query(
            "SELECT set_config('app.authenticated_user_id', $1, false)",
            [randomUUID()]
          );
          const name = signature.slice(0, signature.indexOf('('));
          await expect(
            owner.query(
              `SELECT ${name}($1::uuid${signature.includes('uuid,uuid') ? ', NULL::uuid' : ''})`,
              [randomUUID()]
            )
          ).rejects.toMatchObject({ code: '42501' });
        } finally {
          await owner.query('RESET ROLE');
        }
      }
    );
  }
);
