-- The latest bulk food import of each kind per user (services/bulkImports.ts),
-- so any server instance answers its progress. A running import also holds an
-- advisory lock; a row still marked running without it was interrupted.
-- Written only through the owner pool; the app role has no grant on the
-- system schema's tables.
CREATE TABLE IF NOT EXISTS system.bulk_imports (
  user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  -- 'canadian-nutrient-file' or 'livsmedelsverket'
  kind TEXT NOT NULL,
  status JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
