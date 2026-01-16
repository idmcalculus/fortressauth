import { User } from '@fortressauth/core';
import { Kysely, MysqlDialect, PostgresDialect } from 'kysely';
import { createPool as createMysqlPool } from 'mysql2';
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqlAdapter } from '../adapter.js';
import { down, up } from '../migrations/index.js';
import type { Database as DatabaseSchema } from '../schema.js';
import { defineAdapterTestSuite } from './adapter-suite.js';

type AdapterContext = {
  db: Kysely<DatabaseSchema>;
  adapter: SqlAdapter;
  cleanup: () => Promise<void>;
};

const postgresUrl = process.env.POSTGRES_TEST_URL ?? process.env.POSTGRES_URL;
const mysqlUrl = process.env.MYSQL_TEST_URL ?? process.env.MYSQL_URL;

const createPostgresContext = async (): Promise<AdapterContext> => {
  const pool = new Pool({ connectionString: postgresUrl ?? '' });
  const db = new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
  await up(db, { dialect: 'postgres' });
  const adapter = new SqlAdapter(db, { dialect: 'postgres' });
  return {
    db,
    adapter,
    cleanup: async () => {
      await down(db, { dialect: 'postgres' });
      await db.destroy();
    },
  };
};

const createMysqlContext = async (): Promise<AdapterContext> => {
  const pool = createMysqlPool(mysqlUrl ?? '');
  const db = new Kysely<DatabaseSchema>({
    dialect: new MysqlDialect({ pool }),
  });
  await up(db, { dialect: 'mysql' });
  const adapter = new SqlAdapter(db, { dialect: 'mysql' });
  return {
    db,
    adapter,
    cleanup: async () => {
      await down(db, { dialect: 'mysql' });
      await db.destroy();
    },
  };
};

if (postgresUrl) {
  defineAdapterTestSuite({
    dialect: 'postgres',
    createContext: createPostgresContext,
  });

  describe('SqlAdapter (postgres) dialect storage', () => {
    let context: AdapterContext;

    beforeEach(async () => {
      context = await createPostgresContext();
    });

    afterEach(async () => {
      await context.cleanup();
    });

    it('stores booleans and timestamps using native types', async () => {
      const user = User.create('postgres-type@example.com');
      await context.adapter.createUser(user);
      await context.adapter.updateUser(user.withEmailVerified());

      const row = await context.db
        .selectFrom('users')
        .select(['email_verified', 'created_at'])
        .where('id', '=', user.id)
        .executeTakeFirst();

      expect(typeof row?.email_verified).toBe('boolean');
      expect(typeof row?.created_at).toBe('string');
    });
  });
} else {
  describe.skip('SqlAdapter (postgres)', () => {
    it('requires POSTGRES_TEST_URL or POSTGRES_URL', () => {});
  });
}

if (mysqlUrl) {
  defineAdapterTestSuite({
    dialect: 'mysql',
    createContext: createMysqlContext,
  });

  describe('SqlAdapter (mysql) dialect storage', () => {
    let context: AdapterContext;

    beforeEach(async () => {
      context = await createMysqlContext();
    });

    afterEach(async () => {
      await context.cleanup();
    });

    it('stores booleans and timestamps using native types', async () => {
      const user = User.create('mysql-type@example.com');
      await context.adapter.createUser(user);
      await context.adapter.updateUser(user.withEmailVerified());

      const row = await context.db
        .selectFrom('users')
        .select(['email_verified', 'created_at'])
        .where('id', '=', user.id)
        .executeTakeFirst();

      expect(typeof row?.email_verified).toBe('number');
      expect(row?.created_at).toBeInstanceOf(Date);
    });
  });
} else {
  describe.skip('SqlAdapter (mysql)', () => {
    it('requires MYSQL_TEST_URL or MYSQL_URL', () => {});
  });
}
