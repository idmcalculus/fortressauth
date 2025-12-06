import type { ColumnType } from 'kysely';

export interface UsersTable {
  id: string;
  email: string;
  email_verified: number | boolean;
  created_at: ColumnType<Date, Date | string, Date | string>;
  updated_at: ColumnType<Date, Date | string, Date | string>;
  locked_until: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface AccountsTable {
  id: string;
  user_id: string;
  provider_id: string;
  provider_user_id: string;
  password_hash: string | null;
  created_at: ColumnType<Date, Date | string, Date | string>;
}

export interface SessionsTable {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: ColumnType<Date, Date | string, Date | string>;
}

export interface LoginAttemptsTable {
  id: string;
  user_id: string | null;
  email: string;
  ip_address: string;
  success: number | boolean;
  created_at: ColumnType<Date, Date | string, Date | string>;
}

export interface Database {
  users: UsersTable;
  accounts: AccountsTable;
  sessions: SessionsTable;
  login_attempts: LoginAttemptsTable;
}
