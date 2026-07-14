import { type Kysely, sql } from 'kysely';
import { createMigrationIndex, safeExecute } from './index.js';
import type { MigrationColumnTypes } from './types.js';
import { SQLITE_COLUMN_TYPES } from './types.js';

async function findExistingOAuthStateColumns<T>(
  db: Kysely<T>,
  dialect: MigrationColumnTypes['dialect'],
): Promise<Set<string>> {
  let result: { rows: Array<{ column_name: string }> };

  if (dialect === 'sqlite') {
    result = await sql<{
      column_name: string;
    }>`SELECT name AS column_name FROM pragma_table_info('oauth_states')`.execute(db);
  } else if (dialect === 'postgres') {
    result = await sql<{
      column_name: string;
    }>`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'oauth_states'`.execute(
      db,
    );
  } else {
    result = await sql<{
      column_name: string;
    }>`SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = database() AND table_name = 'oauth_states'`.execute(
      db,
    );
  }

  return new Set(result.rows.map((row) => row.column_name));
}

async function ensureNativeRedirectUriCapacity<T>(
  db: Kysely<T>,
  dialect: MigrationColumnTypes['dialect'],
): Promise<void> {
  if (dialect !== 'mysql') return;
  const result = await sql<{ data_type: string }>`
    SELECT DATA_TYPE AS data_type
    FROM information_schema.columns
    WHERE table_schema = database()
      AND table_name = 'oauth_states'
      AND column_name = 'native_redirect_uri'
  `.execute(db);
  if (result.rows[0]?.data_type.toLowerCase() !== 'text') {
    await sql`ALTER TABLE oauth_states MODIFY COLUMN native_redirect_uri TEXT NULL`.execute(db);
  }
}

export async function up<T>(
  db: Kysely<T>,
  columnTypes: MigrationColumnTypes = SQLITE_COLUMN_TYPES,
): Promise<void> {
  await safeExecute(
    db.schema
      .createTable('native_authorization_grants')
      .ifNotExists()
      .addColumn('id', columnTypes.identifier, (col) => col.primaryKey())
      .addColumn('user_id', columnTypes.identifier, (col) =>
        col.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('client_id', columnTypes.indexedText, (col) => col.notNull())
      .addColumn('selector', columnTypes.selector, (col) => col.notNull().unique())
      .addColumn('verifier_hash', columnTypes.hash, (col) => col.notNull())
      .addColumn('redirect_uri', 'text', (col) => col.notNull())
      .addColumn('code_challenge', 'text', (col) => col.notNull())
      .addColumn('expires_at', columnTypes.timestamp, (col) => col.notNull())
      .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
      .execute(),
  );

  await createMigrationIndex(db, {
    name: 'native_authorization_grants_expires_at_idx',
    table: 'native_authorization_grants',
    columns: ['expires_at'],
    dialect: columnTypes.dialect,
  });

  // Check before altering instead of catching duplicate-column errors. In
  // PostgreSQL, even a caught DDL error aborts the surrounding transaction,
  // which made an otherwise-idempotent migration fail on the next statement.
  const existingColumns = await findExistingOAuthStateColumns(db, columnTypes.dialect);
  for (const column of [
    { name: 'native_client_id', type: columnTypes.indexedText },
    { name: 'native_redirect_uri', type: 'text' as const },
    { name: 'native_code_challenge', type: columnTypes.indexedText },
    { name: 'native_state', type: columnTypes.indexedText },
  ]) {
    if (!existingColumns.has(column.name)) {
      await db.schema.alterTable('oauth_states').addColumn(column.name, column.type).execute();
    }
  }
  await ensureNativeRedirectUriCapacity(db, columnTypes.dialect);
}

export async function down<T>(db: Kysely<T>): Promise<void> {
  await db.schema.dropTable('native_authorization_grants').ifExists().execute();
}
