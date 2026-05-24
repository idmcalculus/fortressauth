import type { Kysely } from 'kysely';
import { down as down001, up as up001 } from './001_initial.js';
import { down as down002, up as up002 } from './002_email_verification.js';
import { down as down003, up as up003 } from './003_password_resets.js';
import { down as down004, up as up004 } from './004_session_split_token.js';
import { down as down005, up as up005 } from './005_oauth_support.js';
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

function isAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error && /already exists|duplicate key name/i.test(error.message);
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

export async function safeExecute(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }
  }
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
  };

  // Postgres and SQLite both support transactional DDL: a failure mid-way
  // through the migration sequence rolls back any preceding statements,
  // leaving the database in its original state. MySQL auto-commits DDL,
  // so wrapping it in a transaction provides no atomicity guarantee — we
  // run the migrations directly in that case.
  if (dialect === 'postgres' || dialect === 'sqlite') {
    try {
      await db.transaction().execute(async (trx) => {
        await runMigrations(trx as unknown as Kysely<T>);
      });
    } catch (error) {
      console.error(
        `[adapter-sql] migration transaction failed (dialect=${dialect}); rolled back`,
        error,
      );
      throw error;
    }
    return;
  }

  // MySQL: best-effort sequence without atomicity. A mid-run failure
  // leaves a partial schema; operators must inspect and fix manually.
  try {
    await runMigrations(db);
  } catch (error) {
    console.error(
      '[adapter-sql] migration failed (dialect=mysql); DDL is not transactional, schema may be partial',
      error,
    );
    throw error;
  }
}

export async function down<T>(db: Kysely<T>, options: MigrationOptions = {}): Promise<void> {
  const dialect = options.dialect ?? 'sqlite';
  const columnTypes = resolveColumnTypes(options);

  const runDown = async (database: Kysely<T>): Promise<void> => {
    await down005(database, columnTypes);
    await down004(database, columnTypes);
    await down003(database, columnTypes);
    await down002(database, columnTypes);
    await down001(database, columnTypes);
  };

  if (dialect === 'postgres' || dialect === 'sqlite') {
    try {
      await db.transaction().execute(async (trx) => {
        await runDown(trx as unknown as Kysely<T>);
      });
    } catch (error) {
      console.error(
        `[adapter-sql] down-migration transaction failed (dialect=${dialect}); rolled back`,
        error,
      );
      throw error;
    }
    return;
  }

  try {
    await runDown(db);
  } catch (error) {
    console.error(
      '[adapter-sql] down-migration failed (dialect=mysql); DDL is not transactional',
      error,
    );
    throw error;
  }
}
