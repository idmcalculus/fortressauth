import type { Kysely } from 'kysely';
import { safeExecute } from './index.js';
import type { MigrationColumnTypes } from './types.js';
import { SQLITE_COLUMN_TYPES } from './types.js';

export async function up<T>(
  db: Kysely<T>,
  columnTypes: MigrationColumnTypes = SQLITE_COLUMN_TYPES,
): Promise<void> {
  // Add oauth_states table
  await safeExecute(
    db.schema
      .createTable('oauth_states')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('provider_id', 'text', (col) => col.notNull())
      .addColumn('state', 'text', (col) => col.notNull())
      .addColumn('code_verifier', 'text')
      .addColumn('redirect_uri', 'text')
      .addColumn('expires_at', columnTypes.timestamp, (col) => col.notNull())
      .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
      .execute(),
  );

  await safeExecute(
    db.schema
      .createIndex('oauth_states_state_idx')
      .ifNotExists()
      .on('oauth_states')
      .column('state')
      .unique()
      .execute(),
  );
}

export async function down<T>(
  db: Kysely<T>,
  _columnTypes: MigrationColumnTypes = SQLITE_COLUMN_TYPES,
): Promise<void> {
  await db.schema.dropTable('oauth_states').ifExists().execute();
}
