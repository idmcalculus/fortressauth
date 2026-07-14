import { type Kysely, sql } from 'kysely';
import { down as down001, up as up001 } from './001_initial.js';
import { down as down002, up as up002 } from './002_email_verification.js';
import { down as down003, up as up003 } from './003_password_resets.js';
import { down as down004, up as up004 } from './004_session_split_token.js';
import { down as down005, up as up005 } from './005_oauth_support.js';
import { down as down006, up as up006 } from './006_native_authorization_grants.js';
import { down as down007, up as up007 } from './007_native_resource_auth.js';
import {
  type MigrationColumnTypes,
  MYSQL_COLUMN_TYPES,
  POSTGRES_COLUMN_TYPES,
  SQLITE_COLUMN_TYPES,
} from './types.js';

export type MigrationDialect = 'sqlite' | 'postgres' | 'mysql';

export interface MigrationOptions {
  dialect?: MigrationDialect;
}

// better-sqlite3 waits synchronously on a busy database. Serialize migrations
// in this process so a second connection cannot block the event loop while the
// first migration is awaiting its next statement. BEGIN IMMEDIATE remains the
// cross-process database lock.
let sqliteMigrationTail: Promise<void> = Promise.resolve();

async function withProcessSqliteLock(run: () => Promise<void>): Promise<void> {
  const previous = sqliteMigrationTail;
  let release = () => {};
  sqliteMigrationTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    await run();
  } finally {
    release();
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /already exists|duplicate key name|duplicate column name|duplicate column/i.test(error.message)
  );
}

function resolveColumnTypes(options?: MigrationOptions): MigrationColumnTypes {
  const dialect = options?.dialect ?? 'sqlite';
  switch (dialect) {
    case 'postgres':
      return POSTGRES_COLUMN_TYPES;
    case 'mysql':
      return MYSQL_COLUMN_TYPES;
    default:
      return SQLITE_COLUMN_TYPES;
  }
}

async function withMigrationLock<T>(
  db: Kysely<T>,
  dialect: MigrationDialect,
  run: (database: Kysely<T>) => Promise<void>,
): Promise<void> {
  if (dialect === 'postgres') {
    await db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(164736291)`.execute(trx);
      await run(trx as unknown as Kysely<T>);
    });
    return;
  }

  const runWithPinnedConnection = () =>
    db.connection().execute(async (connection) => {
      const pinned = connection as unknown as Kysely<T>;
      if (dialect === 'mysql') {
        const acquired = await sql<{ acquired: number }>`
        SELECT GET_LOCK('fortressauth:migrations', 30) AS acquired
      `.execute(pinned);
        if (Number(acquired.rows[0]?.acquired) !== 1) {
          throw new Error('Timed out acquiring the FortressAuth migration lock');
        }
        try {
          await run(pinned);
        } finally {
          await sql`SELECT RELEASE_LOCK('fortressauth:migrations')`.execute(pinned);
        }
        return;
      }

      await sql`PRAGMA busy_timeout = 30000`.execute(pinned);
      await sql`BEGIN IMMEDIATE`.execute(pinned);
      try {
        await run(pinned);
        await sql`COMMIT`.execute(pinned);
      } catch (error) {
        await sql`ROLLBACK`.execute(pinned).catch(() => undefined);
        throw error;
      }
    });

  if (dialect === 'sqlite') {
    await withProcessSqliteLock(runWithPinnedConnection);
    return;
  }
  await runWithPinnedConnection();
}

export async function safeExecute(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }
  }
}

/** MySQL does not support CREATE INDEX IF NOT EXISTS; duplicate-name errors are handled safely. */
export async function createMigrationIndex<T>(
  db: Kysely<T>,
  options: {
    name: string;
    table: string;
    columns: string[];
    unique?: boolean;
    dialect: MigrationDialect;
  },
): Promise<void> {
  let builder = db.schema.createIndex(options.name);
  if (options.dialect !== 'mysql') builder = builder.ifNotExists();
  let columnsBuilder = builder.on(options.table).columns(options.columns);
  if (options.unique) columnsBuilder = columnsBuilder.unique();
  await safeExecute(columnsBuilder.execute());
}

export async function up<T>(db: Kysely<T>, options: MigrationOptions = {}): Promise<void> {
  const dialect = options.dialect ?? 'sqlite';
  const columnTypes = resolveColumnTypes(options);

  const runMigrations = async (database: Kysely<T>): Promise<void> => {
    await up001(database, columnTypes);
    await up002(database, columnTypes);
    await up003(database, columnTypes);
    await up004(database, columnTypes);
    await up005(database, columnTypes);
    await up006(database, columnTypes);
    await up007(database, columnTypes);
  };

  try {
    await withMigrationLock(db, dialect, runMigrations);
  } catch (error) {
    console.error(`[adapter-sql] migration failed (dialect=${dialect})`, error);
    throw error;
  }
}

export async function down<T>(db: Kysely<T>, options: MigrationOptions = {}): Promise<void> {
  const dialect = options.dialect ?? 'sqlite';
  const columnTypes = resolveColumnTypes(options);

  const runDown = async (database: Kysely<T>): Promise<void> => {
    await down007(database);
    await down006(database);
    await down005(database, columnTypes);
    await down004(database, columnTypes);
    await down003(database, columnTypes);
    await down002(database, columnTypes);
    await down001(database, columnTypes);
  };

  try {
    await withMigrationLock(db, dialect, runDown);
  } catch (error) {
    console.error(`[adapter-sql] down-migration failed (dialect=${dialect})`, error);
    throw error;
  }
}
