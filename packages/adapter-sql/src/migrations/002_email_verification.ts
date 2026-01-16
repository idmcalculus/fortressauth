import type { Kysely } from 'kysely';
import { safeExecute } from './index.js';
import { type MigrationColumnTypes, SQLITE_COLUMN_TYPES } from './types.js';

export async function up<T>(
  db: Kysely<T>,
  columnTypes: MigrationColumnTypes = SQLITE_COLUMN_TYPES,
): Promise<void> {
  await safeExecute(
    db.schema
      .createTable('email_verifications')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('user_id', 'text', (col) => col.references('users.id').onDelete('cascade'))
      .addColumn('selector', 'text', (col) => col.notNull())
      .addColumn('verifier_hash', 'text', (col) => col.notNull())
      .addColumn('expires_at', columnTypes.timestamp, (col) => col.notNull())
      .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
      .execute(),
  );

  await safeExecute(
    db.schema
      .createIndex('email_verifications_selector_idx')
      .ifNotExists()
      .on('email_verifications')
      .column('selector')
      .unique()
      .execute(),
  );

  await safeExecute(
    db.schema
      .createIndex('email_verifications_user_id_idx')
      .ifNotExists()
      .on('email_verifications')
      .column('user_id')
      .execute(),
  );
}

export async function down<T>(
  db: Kysely<T>,
  _columnTypes: MigrationColumnTypes = SQLITE_COLUMN_TYPES,
): Promise<void> {
  await db.schema.dropTable('email_verifications').ifExists().execute();
}
