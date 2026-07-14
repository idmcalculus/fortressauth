import type { Kysely } from 'kysely';
import { createMigrationIndex, safeExecute } from './index.js';
import { type MigrationColumnTypes, SQLITE_COLUMN_TYPES } from './types.js';

export async function up<T>(
  db: Kysely<T>,
  columnTypes: MigrationColumnTypes = SQLITE_COLUMN_TYPES,
): Promise<void> {
  await safeExecute(
    db.schema
      .createTable('password_resets')
      .ifNotExists()
      .addColumn('id', columnTypes.identifier, (col) => col.primaryKey())
      .addColumn('user_id', columnTypes.identifier, (col) =>
        col.references('users.id').onDelete('cascade'),
      )
      .addColumn('selector', columnTypes.selector, (col) => col.notNull())
      .addColumn('verifier_hash', columnTypes.hash, (col) => col.notNull())
      .addColumn('expires_at', columnTypes.timestamp, (col) => col.notNull())
      .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
      .execute(),
  );

  await createMigrationIndex(db, {
    name: 'password_resets_selector_idx',
    table: 'password_resets',
    columns: ['selector'],
    unique: true,
    dialect: columnTypes.dialect,
  });

  await createMigrationIndex(db, {
    name: 'password_resets_user_id_idx',
    table: 'password_resets',
    columns: ['user_id'],
    dialect: columnTypes.dialect,
  });
}

export async function down<T>(
  db: Kysely<T>,
  _columnTypes: MigrationColumnTypes = SQLITE_COLUMN_TYPES,
): Promise<void> {
  await db.schema.dropTable('password_resets').ifExists().execute();
}
