import type { ColumnType } from 'kysely';

export interface UsersTable {
  id: string;
  email: string;
  email_verified: number | boolean;
  created_at: ColumnType<Date, Date | string, Date | string>;
  updated_at: ColumnType<Date, Date | string, Date | string>;
  locked_until: ColumnType<Date | null, Date | string | null, Date | string | null>;
  disabled_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
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
  native_client_id: string | null;
  native_audiences: string | null;
  native_email: string | null;
  native_email_verified: number | boolean | null;
  authentication_time: ColumnType<Date | null, Date | string | null, Date | string | null>;
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
  native_client_id: string | null;
  native_redirect_uri: string | null;
  native_code_challenge: string | null;
  native_state: string | null;
  native_audience: string | null;
  native_max_age_seconds: number | null;
  expires_at: ColumnType<Date, Date | string, Date | string>;
  created_at: ColumnType<Date, Date | string, Date | string>;
}

export interface NativeAuthorizationGrantsTable {
  id: string;
  user_id: string;
  client_id: string;
  selector: string;
  verifier_hash: string;
  redirect_uri: string;
  code_challenge: string;
  requested_audience: string | null;
  requested_freshness_seconds: number | null;
  authentication_time: ColumnType<Date | null, Date | string | null, Date | string | null>;
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
  native_authorization_grants: NativeAuthorizationGrantsTable;
  resource_introspection_audit: ResourceIntrospectionAuditTable;
}

export interface ResourceIntrospectionAuditTable {
  id: string;
  resource_server_hash: string | null;
  audience_hash: string | null;
  token_selector_hash: string | null;
  session_id: string | null;
  client_id_hash: string | null;
  source_identity_hash: string | null;
  outcome: string;
  created_at: ColumnType<Date, Date | string, Date | string>;
}
