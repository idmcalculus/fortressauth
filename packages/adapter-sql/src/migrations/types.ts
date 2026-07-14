import { type ColumnDataType, type Expression, sql } from 'kysely';

export type MigrationDialect = 'sqlite' | 'postgres' | 'mysql';

export type MigrationColumnTypes = {
  boolean: ColumnDataType | Expression<unknown>;
  timestamp: ColumnDataType | Expression<unknown>;
  identifier: ColumnDataType | Expression<unknown>;
  email: ColumnDataType | Expression<unknown>;
  indexedText: ColumnDataType | Expression<unknown>;
  selector: ColumnDataType | Expression<unknown>;
  hash: ColumnDataType | Expression<unknown>;
  audience: ColumnDataType | Expression<unknown>;
  /**
   * Dialect tag carried alongside column types so individual migrations can
   * choose dialect-specific code paths (e.g., the right introspection query)
   * without needing a separate parameter. Defaults to 'sqlite' for the
   * exported defaults; the runtime always populates this explicitly.
   */
  dialect: MigrationDialect;
};

export const SQLITE_COLUMN_TYPES: MigrationColumnTypes = {
  boolean: 'boolean',
  timestamp: 'timestamp',
  identifier: 'text',
  email: 'text',
  indexedText: 'text',
  selector: 'text',
  hash: 'text',
  audience: 'text',
  dialect: 'sqlite',
};

export const POSTGRES_COLUMN_TYPES: MigrationColumnTypes = {
  boolean: 'boolean',
  timestamp: 'timestamp',
  identifier: 'text',
  email: 'text',
  indexedText: 'text',
  selector: 'text',
  hash: 'text',
  audience: 'text',
  dialect: 'postgres',
};

export const MYSQL_COLUMN_TYPES: MigrationColumnTypes = {
  boolean: sql`tinyint`,
  timestamp: 'datetime',
  identifier: sql`varchar(64)`,
  email: sql`varchar(320)`,
  indexedText: sql`varchar(255)`,
  selector: sql`varchar(64)`,
  hash: sql`varchar(128)`,
  audience: sql`varchar(256)`,
  dialect: 'mysql',
};
