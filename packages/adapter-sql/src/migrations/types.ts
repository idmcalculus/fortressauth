import { type ColumnDataType, type Expression, sql } from 'kysely';

export type MigrationDialect = 'sqlite' | 'postgres' | 'mysql';

export type MigrationColumnTypes = {
  boolean: ColumnDataType | Expression<unknown>;
  timestamp: ColumnDataType | Expression<unknown>;
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
  dialect: 'sqlite',
};

export const POSTGRES_COLUMN_TYPES: MigrationColumnTypes = {
  boolean: 'boolean',
  timestamp: 'timestamp',
  dialect: 'postgres',
};

export const MYSQL_COLUMN_TYPES: MigrationColumnTypes = {
  boolean: sql`tinyint`,
  timestamp: 'datetime',
  dialect: 'mysql',
};
