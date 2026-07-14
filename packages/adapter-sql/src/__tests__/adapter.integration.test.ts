import { User } from '@fortressauth/core';
import { Kysely, MysqlDialect, PostgresDialect, sql } from 'kysely';
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

if (process.env.REQUIRE_POSTGRES_TESTS === 'true' && !postgresUrl) {
  throw new Error(
    'PostgreSQL integration tests are required, but POSTGRES_TEST_URL or POSTGRES_URL is not set.',
  );
}

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
      expect(row?.created_at).toBeInstanceOf(Date);
    });

    it('applies native resource-auth migrations idempotently', async () => {
      await up(context.db, { dialect: 'postgres' });

      const columns = await sql<{
        column_name: string;
      }>`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'oauth_states'`.execute(
        context.db,
      );
      const columnNames = new Set(columns.rows.map((row) => row.column_name));

      expect([...columnNames]).toEqual(
        expect.arrayContaining([
          'native_client_id',
          'native_redirect_uri',
          'native_code_challenge',
          'native_state',
          'native_audience',
          'native_max_age_seconds',
        ]),
      );

      const sessionColumns = await sql<{
        column_name: string;
      }>`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'sessions'`.execute(
        context.db,
      );
      expect(sessionColumns.rows.map((row) => row.column_name)).toEqual(
        expect.arrayContaining([
          'native_client_id',
          'native_audiences',
          'native_email',
          'native_email_verified',
          'authentication_time',
        ]),
      );
      const auditTable = await sql<{
        table_name: string;
      }>`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'resource_introspection_audit'`.execute(
        context.db,
      );
      expect(auditTable.rows).toHaveLength(1);
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

    it('applies bounded native resource-auth migrations idempotently', async () => {
      await up(context.db, { dialect: 'mysql' });

      const columns = await sql<{
        column_name: string;
        data_type: string;
        character_maximum_length: number | null;
      }>`SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type, CHARACTER_MAXIMUM_LENGTH AS character_maximum_length FROM information_schema.columns WHERE table_schema = database() AND table_name = 'sessions'`.execute(
        context.db,
      );
      const byName = new Map(columns.rows.map((row) => [row.column_name, row]));

      expect(byName.get('id')).toMatchObject({
        data_type: 'varchar',
        character_maximum_length: 64,
      });
      expect(byName.get('native_client_id')).toMatchObject({
        data_type: 'varchar',
        character_maximum_length: 255,
      });
      expect(byName.get('native_audiences')?.data_type).toBe('text');
      const auditTable = await sql<{
        table_name: string;
      }>`SELECT TABLE_NAME AS table_name FROM information_schema.tables WHERE table_schema = database() AND table_name = 'resource_introspection_audit'`.execute(
        context.db,
      );
      expect(auditTable.rows).toHaveLength(1);

      const redirectColumns = await sql<{
        table_name: string;
        column_name: string;
        data_type: string;
      }>`SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type FROM information_schema.columns WHERE table_schema = database() AND ((table_name = 'oauth_states' AND column_name = 'native_redirect_uri') OR (table_name = 'native_authorization_grants' AND column_name = 'redirect_uri'))`.execute(
        context.db,
      );
      expect(redirectColumns.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            table_name: 'oauth_states',
            column_name: 'native_redirect_uri',
            data_type: 'text',
          }),
          expect.objectContaining({
            table_name: 'native_authorization_grants',
            column_name: 'redirect_uri',
            data_type: 'text',
          }),
        ]),
      );
    });
  });
} else {
  describe.skip('SqlAdapter (mysql)', () => {
    it('requires MYSQL_TEST_URL or MYSQL_URL', () => {});
  });
}
