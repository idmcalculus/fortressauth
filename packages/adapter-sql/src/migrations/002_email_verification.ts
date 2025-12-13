import type { Kysely } from 'kysely';

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && /already exists/i.test(error.message);
}

async function safeExecute(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }
  }
}

export async function up<T>(db: Kysely<T>): Promise<void> {
  await safeExecute(
    db.schema
      .createTable('email_verifications')
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

export async function down<T>(db: Kysely<T>): Promise<void> {
  await db.schema.dropTable('email_verifications').ifExists().execute();
}
