import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
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
