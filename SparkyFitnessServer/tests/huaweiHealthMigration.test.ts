import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  'db/migrations/20260710150000_add_huawei_health_provider.sql'
);

describe('HUAWEI Health provider migration', () => {
  it('registers a strictly private provider with no per-user credential fields', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain("'huaweihealth'");
    expect(sql).toContain("'HUAWEI Health'");
    expect(sql).toContain('external_data_providers_huaweihealth_user_unique');
    expect(sql).toMatch(/is_strictly_private[\s\S]*TRUE/i);
    expect(sql).toMatch(/required_fields[\s\S]*ARRAY\[\]::VARCHAR\[\]/i);
    expect(sql).toMatch(/categories[\s\S]*ARRAY\['other'\]/i);
  });
});
