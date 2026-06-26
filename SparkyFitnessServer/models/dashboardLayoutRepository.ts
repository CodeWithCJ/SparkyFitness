import { getClient } from '../db/poolManager.js';

const TABLE_NAME = 'user_dashboard_layouts';

export interface DashboardLayoutRow {
  id: string;
  user_id: string;
  page_key: string;
  layout: unknown;
  hidden: unknown;
  created_at: string;
  updated_at: string;
}

export interface DashboardLayoutInput {
  layout: unknown;
  hidden: unknown;
}

async function getDashboardLayout(
  userId: string,
  pageKey: string
): Promise<DashboardLayoutRow | null> {
  const query = `SELECT * FROM ${TABLE_NAME} WHERE user_id = $1 AND page_key = $2`;
  const client = await getClient(userId);
  try {
    const { rows } = await client.query(query, [userId, pageKey]);
    return rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function upsertDashboardLayout(
  userId: string,
  pageKey: string,
  data: DashboardLayoutInput
): Promise<DashboardLayoutRow> {
  const query = `
    INSERT INTO ${TABLE_NAME} (user_id, page_key, layout, hidden)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, page_key)
    DO UPDATE SET layout = EXCLUDED.layout, hidden = EXCLUDED.hidden, updated_at = NOW()
    RETURNING *;
  `;
  const client = await getClient(userId);
  try {
    const { rows } = await client.query(query, [
      userId,
      pageKey,
      JSON.stringify(data.layout),
      JSON.stringify(data.hidden),
    ]);
    return rows[0];
  } finally {
    client.release();
  }
}

async function deleteDashboardLayout(
  userId: string,
  pageKey: string
): Promise<void> {
  const query = `DELETE FROM ${TABLE_NAME} WHERE user_id = $1 AND page_key = $2`;
  const client = await getClient(userId);
  try {
    await client.query(query, [userId, pageKey]);
  } finally {
    client.release();
  }
}

export { getDashboardLayout, upsertDashboardLayout, deleteDashboardLayout };
export default {
  getDashboardLayout,
  upsertDashboardLayout,
  deleteDashboardLayout,
};
