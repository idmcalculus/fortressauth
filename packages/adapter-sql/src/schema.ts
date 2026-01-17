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
  selector: string;
  verifier_hash: string;
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

export interface EmailVerificationsTable {
  id: string;
  user_id: string;
  selector: string;
  verifier_hash: string;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  created_at: ColumnType<Date, Date | string, Date | string>;
}

export interface PasswordResetsTable {
  id: string;
  user_id: string;
  selector: string;
  verifier_hash: string;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  created_at: ColumnType<Date, Date | string, Date | string>;
}

export interface OAuthStatesTable {
  id: string;
  provider_id: string;
  state: string;
  code_verifier: string | null;
  redirect_uri: string | null;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  created_at: ColumnType<Date, Date | string, Date | string>;
}

export interface Database {
  users: UsersTable;
  accounts: AccountsTable;
  sessions: SessionsTable;
  login_attempts: LoginAttemptsTable;
  email_verifications: EmailVerificationsTable;
  password_resets: PasswordResetsTable;
  oauth_states: OAuthStatesTable;
}
