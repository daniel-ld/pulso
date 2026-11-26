import pg from "pg";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5000,
});
export async function migrate() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(771289)");
    await c.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS entities (
        id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), type text NOT NULL CHECK(type IN ('task','project','section','label','filter')),
        data jsonb NOT NULL, version integer NOT NULL DEFAULT 1, deleted_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS entities_owner_type ON entities(owner_id, type);
      CREATE TABLE IF NOT EXISTS changes (
        seq bigserial PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), entity jsonb NOT NULL
      );
      CREATE INDEX IF NOT EXISTS changes_owner_seq ON changes(owner_id,seq);
      CREATE TABLE IF NOT EXISTS operations (
        id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS completions (
        id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), task_id uuid NOT NULL, occurrence text NOT NULL,
        completed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(task_id,occurrence)
      );
      INSERT INTO schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id text PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), subscription jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS reminder_deliveries (
        task_id uuid NOT NULL, reminder_at text NOT NULL, subscription_id text NOT NULL,
        delivered_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(task_id,reminder_at,subscription_id)
      );
      INSERT INTO schema_migrations(version) VALUES (2) ON CONFLICT DO NOTHING;
    `);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
