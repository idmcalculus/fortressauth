import type { Kysely } from 'kysely';
import { safeExecute } from './index.js';

export async function up<T>(db: Kysely<T>): Promise<void> {
  await safeExecute(
    db.schema
      .createTable('password_resets')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('user_id', 'text', (col) => col.references('users.id').onDelete('cascade'))
      .addColumn('selector', 'text', (col) => col.notNull())
      .addColumn('verifier_hash', 'text', (col) => col.notNull())
      .addColumn('expires_at', 'timestamp', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) => col.notNull())
      .execute(),
  );

  await safeExecute(
    db.schema
      .createIndex('password_resets_selector_idx')
      .ifNotExists()
      .on('password_resets')
      .column('selector')
      .unique()
      .execute(),
  );

  await safeExecute(
    db.schema
      .createIndex('password_resets_user_id_idx')
      .ifNotExists()
      .on('password_resets')
      .column('user_id')
      .execute(),
  );
}

export async function down<T>(db: Kysely<T>): Promise<void> {
  await db.schema.dropTable('password_resets').ifExists().execute();
}
