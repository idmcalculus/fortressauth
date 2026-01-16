import type { Kysely } from 'kysely';
import { down as downBase, up as upBase } from './index.js';

export async function up<T>(db: Kysely<T>): Promise<void> {
  await upBase(db, { dialect: 'postgres' });
}

export async function down<T>(db: Kysely<T>): Promise<void> {
  await downBase(db, { dialect: 'postgres' });
}
