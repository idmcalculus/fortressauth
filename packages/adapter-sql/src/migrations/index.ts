import type { Kysely } from 'kysely';
import { down as down001, up as up001 } from './001_initial.js';
import { down as down002, up as up002 } from './002_email_verification.js';
import { down as down003, up as up003 } from './003_password_resets.js';
import { down as down004, up as up004 } from './004_session_split_token.js';

export async function up<T>(db: Kysely<T>): Promise<void> {
  await up001(db);
  await up002(db);
  await up003(db);
  await up004(db);
}

export async function down<T>(db: Kysely<T>): Promise<void> {
  await down004(db);
  await down003(db);
  await down002(db);
  await down001(db);
}
