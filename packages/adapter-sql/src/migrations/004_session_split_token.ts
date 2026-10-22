import { type Kysely, sql } from 'kysely';
import { createMigrationIndex, safeExecute } from './index.js';
import { type MigrationColumnTypes, SQLITE_COLUMN_TYPES } from './types.js';

/**
 * Returns true if the existing `sessions` table has the legacy `token_hash`
 * column. The split-token redesign in this migration removes that column in
 * favour of `selector` + `verifier_hash`. Older deployments must be migrated
 * destructively because the legacy single-token format cannot be derived
 * from the new split form.
 *
 * Returns false on fresh installs (table doesn't exist yet) and on installs
 * that have already been migrated to the split-token shape.
 *
 * Dispatches on dialect because issuing the wrong introspection query inside
 * a Postgres transaction would error and abort the entire migration; we
 * cannot rely on try/catch to recover once the transaction is poisoned.
 */
async function hasLegacyTokenHashColumn<T>(
  db: Kysely<T>,
  dialect: 'sqlite' | 'postgres' | 'mysql',
): Promise<boolean> {
  if (dialect === 'sqlite') {
    try {
      const result = await sql<{
        column_name: string;
      }>`SELECT name AS column_name FROM pragma_table_info('sessions') WHERE name = 'token_hash'`.execute(
        db,
      );
      return result.rows.length > 0;
    } catch {
      // Table doesn't exist yet: fresh install, no legacy column.
      return false;
    }
  }

  // Postgres and MySQL both support information_schema.
  try {
    const result = await sql<{
      column_name: string;
    }>`SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_name = 'sessions' AND column_name = 'token_hash'`.execute(
      db,
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

export async function up<T>(
  db: Kysely<T>,
  columnTypes: MigrationColumnTypes = SQLITE_COLUMN_TYPES,
): Promise<void> {
  // Only drop and recreate the sessions table when migrating from the legacy
  // single-token schema. On fresh installs the table won't exist yet; on
  // already-migrated installs the table is already in the new shape and must
  // not be dropped (doing so would invalidate every active session on every
  // process start).
  if (await hasLegacyTokenHashColumn(db, columnTypes.dialect)) {
    await db.schema.dropTable('sessions').ifExists().execute();
  }

  await safeExecute(
    db.schema
      .createTable('sessions')
      .ifNotExists()
      .addColumn('id', columnTypes.identifier, (col) => col.primaryKey())
      .addColumn('user_id', columnTypes.identifier, (col) =>
        col.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('selector', columnTypes.selector, (col) => col.notNull().unique())
      .addColumn('verifier_hash', columnTypes.hash, (col) => col.notNull())
      .addColumn('expires_at', columnTypes.timestamp, (col) => col.notNull())
      .addColumn('ip_address', 'text')
      .addColumn('user_agent', 'text')
      .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
      .execute(),
  );

  await createMigrationIndex(db, {
    name: 'sessions_user_id_idx',
    table: 'sessions',
    columns: ['user_id'],
    dialect: columnTypes.dialect,
  });
}

export async function down<T>(
  db: Kysely<T>,
  columnTypes: MigrationColumnTypes = SQLITE_COLUMN_TYPES,
): Promise<void> {
  await db.schema.dropTable('sessions').ifExists().execute();

  // Recreate legacy sessions table with token_hash
  await db.schema
    .createTable('sessions')
    .ifNotExists()
    .addColumn('id', columnTypes.identifier, (col) => col.primaryKey())
    .addColumn('user_id', columnTypes.identifier, (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('token_hash', columnTypes.hash, (col) => col.notNull().unique())
    .addColumn('expires_at', columnTypes.timestamp, (col) => col.notNull())
    .addColumn('ip_address', 'text')
    .addColumn('user_agent', 'text')
    .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
    .execute();

  await createMigrationIndex(db, {
    name: 'sessions_user_id_idx',
    table: 'sessions',
    columns: ['user_id'],
    dialect: columnTypes.dialect,
  });
}
