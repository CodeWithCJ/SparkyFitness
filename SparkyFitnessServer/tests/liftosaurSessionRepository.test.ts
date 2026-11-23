import { vi, describe, it, expect } from 'vitest';
import type { PoolClient } from 'pg';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { getStoredEntryDurationsWithClient } from '../integrations/liftosaur/liftosaurSessionRepository.js';

describe('getStoredEntryDurationsWithClient', () => {
  it('reads duration and edited fields of the given Liftosaur entries', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          source_id: '9_Squat_0',
          duration_minutes: 60,
          manual_fields: ['duration_minutes'],
        },
        { source_id: '9_Curl_0', duration_minutes: 0, manual_fields: null },
      ],
    });
    const client = { query } as unknown as PoolClient;

    const result = await getStoredEntryDurationsWithClient(client, 'user-1', [
      '9_Squat_0',
      '9_Curl_0',
    ]);

    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/source = \$2 AND source_id = ANY\(\$3::text\[\]\)/);
    expect(params).toEqual(['user-1', 'Liftosaur', ['9_Squat_0', '9_Curl_0']]);
    expect(result.get('9_Squat_0')).toEqual({
      duration_minutes: 60,
      manual_fields: ['duration_minutes'],
    });
    expect(result.get('9_Curl_0')).toEqual({
      duration_minutes: 0,
      manual_fields: [],
    });
  });

  it('makes no query without source ids', async () => {
    const query = vi.fn();
    const client = { query } as unknown as PoolClient;

    expect(
      (await getStoredEntryDurationsWithClient(client, 'user-1', [])).size
    ).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
