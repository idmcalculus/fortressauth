import { type Kysely, sql } from 'kysely';
import { createMigrationIndex, safeExecute } from './index.js';
import type { MigrationColumnTypes } from './types.js';
import { SQLITE_COLUMN_TYPES } from './types.js';

async function existingColumns<T>(
  db: Kysely<T>,
  table: string,
  dialect: MigrationColumnTypes['dialect'],
): Promise<Set<string>> {
  let result: { rows: Array<{ column_name: string }> };
  if (dialect === 'sqlite') {
    result = await sql<{
      column_name: string;
    }>`SELECT name AS column_name FROM pragma_table_info(${sql.lit(table)})`.execute(db);
  } else if (dialect === 'postgres') {
    result = await sql<{
      column_name: string;
    }>`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ${table}`.execute(
      db,
    );
  } else {
    result = await sql<{
      column_name: string;
    }>`SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = database() AND table_name = ${table}`.execute(
      db,
    );
  }
  return new Set(result.rows.map((row) => row.column_name));
}

async function addMissingColumns<T>(
  db: Kysely<T>,
  table: string,
  columns: Array<{
    name: string;
    type:
      | MigrationColumnTypes['timestamp']
      | MigrationColumnTypes['boolean']
      | MigrationColumnTypes['indexedText']
      | MigrationColumnTypes['audience']
      | 'text'
      | 'integer';
  }>,
  dialect: MigrationColumnTypes['dialect'],
): Promise<void> {
  const existing = await existingColumns(db, table, dialect);
  for (const column of columns) {
    if (!existing.has(column.name)) {
      await db.schema
        .alterTable(table)
        .addColumn(column.name, column.type as never)
        .execute();
    }
  }
}

export async function up<T>(
  db: Kysely<T>,
  columnTypes: MigrationColumnTypes = SQLITE_COLUMN_TYPES,
): Promise<void> {
  await addMissingColumns(
    db,
    'users',
    [{ name: 'disabled_at', type: columnTypes.timestamp }],
    columnTypes.dialect,
  );
  await addMissingColumns(
    db,
    'sessions',
    [
      { name: 'native_client_id', type: columnTypes.indexedText },
      { name: 'native_audiences', type: 'text' },
      { name: 'native_email', type: 'text' },
      { name: 'native_email_verified', type: columnTypes.boolean },
      { name: 'authentication_time', type: columnTypes.timestamp },
    ],
    columnTypes.dialect,
  );
  await addMissingColumns(
    db,
    'native_authorization_grants',
    [
      { name: 'requested_audience', type: columnTypes.audience },
      { name: 'requested_freshness_seconds', type: 'integer' },
      { name: 'authentication_time', type: columnTypes.timestamp },
    ],
    columnTypes.dialect,
  );
  await addMissingColumns(
    db,
    'oauth_states',
    [
      { name: 'native_audience', type: columnTypes.audience },
      { name: 'native_max_age_seconds', type: 'integer' },
    ],
    columnTypes.dialect,
  );

  await safeExecute(
    db.schema
      .createTable('resource_introspection_audit')
      .ifNotExists()
      .addColumn('id', columnTypes.identifier, (col) => col.primaryKey())
      .addColumn('resource_server_hash', columnTypes.hash)
      .addColumn('audience_hash', columnTypes.hash)
      .addColumn('token_selector_hash', columnTypes.hash)
      .addColumn('session_id', columnTypes.identifier)
      .addColumn('client_id_hash', columnTypes.hash)
      .addColumn('source_identity_hash', columnTypes.hash)
      .addColumn('outcome', columnTypes.indexedText, (col) => col.notNull())
      .addColumn('created_at', columnTypes.timestamp, (col) => col.notNull())
      .execute(),
  );
  await createMigrationIndex(db, {
    name: 'sessions_native_client_id_idx',
    table: 'sessions',
    columns: ['native_client_id'],
    dialect: columnTypes.dialect,
  });
  await createMigrationIndex(db, {
    name: 'resource_introspection_audit_created_idx',
    table: 'resource_introspection_audit',
    columns: ['created_at'],
    dialect: columnTypes.dialect,
  });
  await createMigrationIndex(db, {
    name: 'resource_introspection_audit_resource_idx',
    table: 'resource_introspection_audit',
    columns: ['resource_server_hash', 'created_at'],
    dialect: columnTypes.dialect,
  });
}

export async function down<T>(db: Kysely<T>): Promise<void> {
  // Binding columns are deliberately retained to avoid destroying active-session metadata.
  await db.schema.dropTable('resource_introspection_audit').ifExists().execute();
}
