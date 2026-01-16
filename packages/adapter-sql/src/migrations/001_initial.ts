import type { Kysely } from 'kysely';
import { safeExecute } from './index.js';
import { type MigrationColumnTypes, SQLITE_COLUMN_TYPES } from './types.js';

// Generic type parameter allows any database schema since migrations only use schema builder
export async function up<T>(
  db: Kysely<T>,
  columnTypes: MigrationColumnTypes = SQLITE_COLUMN_TYPES,
): Promise<void> {
  await safeExecute(
    db.schema
      .createTable('users')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('email', 'text', (col) => col.notNull().unique())
      .addColumn('email_verified', columnTypes.boolean, (col) => col.notNull().defaultTo(false))
      .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
      .addColumn('updated_at', columnTypes.timestamp, (col) => col.notNull())
      .addColumn('locked_until', columnTypes.timestamp)
      .execute(),
  );

  // Note: email already has a unique constraint which creates an implicit index

  await safeExecute(
    db.schema
      .createTable('accounts')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('user_id', 'text', (col) =>
        col.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('provider_id', 'text', (col) => col.notNull())
      .addColumn('provider_user_id', 'text', (col) => col.notNull())
      .addColumn('password_hash', 'text')
      .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
      .execute(),
  );

  await safeExecute(
    db.schema
      .createIndex('accounts_provider_idx')
      .ifNotExists()
      .on('accounts')
      .columns(['provider_id', 'provider_user_id'])
      .unique()
      .execute(),
  );

  await safeExecute(
    db.schema
      .createIndex('accounts_user_id_idx')
      .ifNotExists()
      .on('accounts')
      .column('user_id')
      .execute(),
  );

  await safeExecute(
    db.schema
      .createTable('sessions')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('user_id', 'text', (col) =>
        col.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('token_hash', 'text', (col) => col.notNull().unique())
      .addColumn('expires_at', columnTypes.timestamp, (col) => col.notNull())
      .addColumn('ip_address', 'text')
      .addColumn('user_agent', 'text')
      .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
      .execute(),
  );

  // Note: token_hash already has a unique constraint which creates an implicit index

  await safeExecute(
    db.schema
      .createIndex('sessions_user_id_idx')
      .ifNotExists()
      .on('sessions')
      .column('user_id')
      .execute(),
  );

  await safeExecute(
    db.schema
      .createTable('login_attempts')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('user_id', 'text', (col) => col.references('users.id').onDelete('set null'))
      .addColumn('email', 'text', (col) => col.notNull())
      .addColumn('ip_address', 'text', (col) => col.notNull())
      .addColumn('success', columnTypes.boolean, (col) => col.notNull())
      .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
      .execute(),
  );

  await safeExecute(
    db.schema
      .createIndex('login_attempts_email_created_idx')
      .ifNotExists()
      .on('login_attempts')
      .columns(['email', 'created_at'])
      .execute(),
  );
}

export async function down<T>(
  db: Kysely<T>,
  _columnTypes: MigrationColumnTypes = SQLITE_COLUMN_TYPES,
): Promise<void> {
  await db.schema.dropTable('login_attempts').ifExists().execute();
  await db.schema.dropTable('sessions').ifExists().execute();
  await db.schema.dropTable('accounts').ifExists().execute();
  await db.schema.dropTable('users').ifExists().execute();
}
