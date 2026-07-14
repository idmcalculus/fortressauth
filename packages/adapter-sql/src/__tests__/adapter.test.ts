import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { describe, expect, it } from 'vitest';
import { SqlAdapter } from '../adapter.js';
import { down, up } from '../migrations/index.js';
import type { Database as DatabaseSchema } from '../schema.js';
import { defineAdapterTestSuite } from './adapter-suite.js';

defineAdapterTestSuite({
  dialect: 'sqlite',
  createContext: async () => {
    const sqlite = new Database(':memory:');
    const db = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: sqlite }),
    });
    await up(db, { dialect: 'sqlite' });
    const adapter = new SqlAdapter(db, { dialect: 'sqlite' });

    return {
      db,
      adapter,
      cleanup: async () => {
        await down(db, { dialect: 'sqlite' });
        await db.destroy();
        sqlite.close();
      },
    };
  },
});

describe('SQLite native resource-auth migration', () => {
  it('is idempotent and retains legacy-compatible nullable binding columns', async () => {
    const sqlite = new Database(':memory:');
    const db = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: sqlite }),
    });
    try {
      await up(db, { dialect: 'sqlite' });
      await up(db, { dialect: 'sqlite' });
      const sessionColumns = sqlite.prepare("PRAGMA table_info('sessions')").all() as Array<{
        name: string;
        notnull: number;
      }>;
      const byName = new Map(sessionColumns.map((column) => [column.name, column]));
      expect(byName.get('native_client_id')?.notnull).toBe(0);
      expect(byName.get('native_audiences')?.notnull).toBe(0);
      expect(
        sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='resource_introspection_audit'",
          )
          .get(),
      ).toBeDefined();
    } finally {
      await down(db, { dialect: 'sqlite' });
      await db.destroy();
      sqlite.close();
    }
  });

  it('serializes concurrent migration attempts from separate connections', async () => {
    const path = join(tmpdir(), `fortressauth-migration-${randomUUID()}.sqlite`);
    const firstSqlite = new Database(path);
    const secondSqlite = new Database(path);
    const first = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: firstSqlite }),
    });
    const second = new Kysely<DatabaseSchema>({
      dialect: new SqliteDialect({ database: secondSqlite }),
    });
    try {
      await Promise.all([up(first, { dialect: 'sqlite' }), up(second, { dialect: 'sqlite' })]);
      expect(
        firstSqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='native_authorization_grants'",
          )
          .get(),
      ).toBeDefined();
    } finally {
      await down(first, { dialect: 'sqlite' });
      await Promise.all([first.destroy(), second.destroy()]);
      firstSqlite.close();
      secondSqlite.close();
    }
  });
});
