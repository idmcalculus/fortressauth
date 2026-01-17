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
  const columnTypes = resolveColumnTypes(options);
  await up001(db, columnTypes);
  await up002(db, columnTypes);
  await up003(db, columnTypes);
  await up004(db, columnTypes);
  await up005(db, columnTypes);
}

export async function down<T>(db: Kysely<T>, options: MigrationOptions = {}): Promise<void> {
  const columnTypes = resolveColumnTypes(options);
  await down005(db, columnTypes);
  await down004(db, columnTypes);
  await down003(db, columnTypes);
  await down002(db, columnTypes);
  await down001(db, columnTypes);
}
