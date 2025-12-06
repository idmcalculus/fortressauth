import type { Kysely } from 'kysely';

// Generic type parameter allows any database schema since migrations only use schema builder
export async function up<T>(db: Kysely<T>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('email', 'text', (col) => col.notNull().unique())
    .addColumn('email_verified', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('created_at', 'timestamp', (col) => col.notNull())
    .addColumn('updated_at', 'timestamp', (col) => col.notNull())
    .addColumn('locked_until', 'timestamp')
    .execute();

  // Note: email already has a unique constraint which creates an implicit index

  await db.schema
    .createTable('accounts')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('provider_id', 'text', (col) => col.notNull())
    .addColumn('provider_user_id', 'text', (col) => col.notNull())
    .addColumn('password_hash', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('accounts_provider_idx')
    .on('accounts')
    .columns(['provider_id', 'provider_user_id'])
    .unique()
    .execute();

  await db.schema.createIndex('accounts_user_id_idx').on('accounts').column('user_id').execute();

  await db.schema
    .createTable('sessions')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('token_hash', 'text', (col) => col.notNull().unique())
    .addColumn('expires_at', 'timestamp', (col) => col.notNull())
    .addColumn('ip_address', 'text')
    .addColumn('user_agent', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.notNull())
    .execute();

  // Note: token_hash already has a unique constraint which creates an implicit index

  await db.schema.createIndex('sessions_user_id_idx').on('sessions').column('user_id').execute();

  await db.schema
    .createTable('login_attempts')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('user_id', 'text', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('email', 'text', (col) => col.notNull())
    .addColumn('ip_address', 'text', (col) => col.notNull())
    .addColumn('success', 'boolean', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex('login_attempts_email_created_idx')
    .on('login_attempts')
    .columns(['email', 'created_at'])
    .execute();
}

export async function down<T>(db: Kysely<T>): Promise<void> {
  await db.schema.dropTable('login_attempts').execute();
  await db.schema.dropTable('sessions').execute();
  await db.schema.dropTable('accounts').execute();
  await db.schema.dropTable('users').execute();
}
