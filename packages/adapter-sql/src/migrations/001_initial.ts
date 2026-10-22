import type { Kysely } from 'kysely';
import { createMigrationIndex, safeExecute } from './index.js';
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
      .addColumn('id', columnTypes.identifier, (col) => col.primaryKey())
      .addColumn('email', columnTypes.email, (col) => col.notNull().unique())
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
      .addColumn('id', columnTypes.identifier, (col) => col.primaryKey())
      .addColumn('user_id', columnTypes.identifier, (col) =>
        col.notNull().references('users.id').onDelete('cascade'),
      )
      .addColumn('provider_id', columnTypes.indexedText, (col) => col.notNull())
      .addColumn('provider_user_id', columnTypes.indexedText, (col) => col.notNull())
      .addColumn('password_hash', 'text')
      .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
      .execute(),
  );

  await createMigrationIndex(db, {
    name: 'accounts_provider_idx',
    table: 'accounts',
    columns: ['provider_id', 'provider_user_id'],
    unique: true,
    dialect: columnTypes.dialect,
  });

  await createMigrationIndex(db, {
    name: 'accounts_user_id_idx',
    table: 'accounts',
    columns: ['user_id'],
    dialect: columnTypes.dialect,
  });

  await safeExecute(
    db.schema
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
      .execute(),
  );

  // Note: token_hash already has a unique constraint which creates an implicit index

  await createMigrationIndex(db, {
    name: 'sessions_user_id_idx',
    table: 'sessions',
    columns: ['user_id'],
    dialect: columnTypes.dialect,
  });

  await safeExecute(
    db.schema
      .createTable('login_attempts')
      .ifNotExists()
      .addColumn('id', columnTypes.identifier, (col) => col.primaryKey())
      .addColumn('user_id', columnTypes.identifier, (col) =>
        col.references('users.id').onDelete('set null'),
      )
      .addColumn('email', columnTypes.email, (col) => col.notNull())
      .addColumn('ip_address', 'text', (col) => col.notNull())
      .addColumn('success', columnTypes.boolean, (col) => col.notNull())
      .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
      .execute(),
  );

  await createMigrationIndex(db, {
    name: 'login_attempts_email_created_idx',
    table: 'login_attempts',
    columns: ['email', 'created_at'],
    dialect: columnTypes.dialect,
  });
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
