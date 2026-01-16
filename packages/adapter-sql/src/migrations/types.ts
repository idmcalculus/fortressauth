import { type ColumnDataType, type Expression, sql } from 'kysely';

export type MigrationColumnTypes = {
  boolean: ColumnDataType | Expression<unknown>;
  timestamp: ColumnDataType | Expression<unknown>;
};

export const SQLITE_COLUMN_TYPES: MigrationColumnTypes = {
  boolean: 'boolean',
  timestamp: 'timestamp',
};

export const POSTGRES_COLUMN_TYPES: MigrationColumnTypes = {
  boolean: 'boolean',
  timestamp: 'timestamp',
};

export const MYSQL_COLUMN_TYPES: MigrationColumnTypes = {
  boolean: sql`tinyint`,
  timestamp: 'datetime',
};
