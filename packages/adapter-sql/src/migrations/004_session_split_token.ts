import type { Kysely } from 'kysely';
import { safeExecute } from './index.js';
import { type MigrationColumnTypes, SQLITE_COLUMN_TYPES } from './types.js';

export async function up<T>(
  db: Kysely<T>,
  columnTypes: MigrationColumnTypes = SQLITE_COLUMN_TYPES,
): Promise<void> {
  // Drop old sessions table if it exists to ensure schema matches split-token design
  await db.schema.dropTable('sessions').ifExists().execute();

  await safeExecute(
    db.schema
      .createTable('sessions')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('user_id', 'text', (col) =>
        col.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('selector', 'text', (col) => col.notNull().unique())
      .addColumn('verifier_hash', 'text', (col) => col.notNull())
      .addColumn('expires_at', columnTypes.timestamp, (col) => col.notNull())
      .addColumn('ip_address', 'text')
      .addColumn('user_agent', 'text')
      .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
      .execute(),
  );

  await safeExecute(
    db.schema
      .createIndex('sessions_user_id_idx')
      .ifNotExists()
      .on('sessions')
      .column('user_id')
      .execute(),
  );
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
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('token_hash', 'text', (col) => col.notNull().unique())
    .addColumn('expires_at', columnTypes.timestamp, (col) => col.notNull())
    .addColumn('ip_address', 'text')
    .addColumn('user_agent', 'text')
    .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('sessions_user_id_idx')
    .ifNotExists()
    .on('sessions')
    .column('user_id')
    .execute();
}
