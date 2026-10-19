CREATE TABLE IF NOT EXISTS food_assistant_preferences (
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (length(key) BETWEEN 1 AND 100),
  value text NOT NULL CHECK (length(value) BETWEEN 1 AND 2000),
  source_quote text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS food_assistant_tasks (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('recipe', 'meal_plan', 'diary', 'shopping', 'analysis')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  creation_hash text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'awaiting_input', 'complete', 'cancelled', 'failed')),
  checkpoint jsonb NOT NULL CHECK (jsonb_typeof(checkpoint) = 'object'),
  result jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  CHECK (status <> 'complete' OR result IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS food_assistant_tasks_user_updated ON food_assistant_tasks(user_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS food_assistant_operations (
  id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  kind text NOT NULL,
  request_hash text NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (task_id, user_id) REFERENCES food_assistant_tasks(id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS food_assistant_operations_task ON food_assistant_operations(user_id, task_id, created_at);
ALTER TABLE food_assistant_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_assistant_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_assistant_operations ENABLE ROW LEVEL SECURITY;
-- Owner-only policies are installed by the canonical db/rls_policies.sql.
