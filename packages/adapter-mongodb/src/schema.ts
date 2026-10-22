export type MongoUserDocument = {
  _id: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  lockedUntil: Date | null;
  disabledAt?: Date | null;
};

export type MongoAccountDocument = {
  _id: string;
  userId: string;
  providerId: string;
  providerUserId: string;
  passwordHash: string | null;
  createdAt: Date;
};

export type MongoSessionDocument = {
  _id: string;
  userId: string;
  selector: string;
  verifierHash: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  nativeClientId?: string | null;
  nativeAudiences?: string[] | null;
  nativeEmail?: string | null;
  nativeEmailVerified?: boolean | null;
  authenticationTime?: Date | null;
};

export type MongoEmailVerificationDocument = {
  _id: string;
  userId: string;
  selector: string;
  verifierHash: string;
  expiresAt: Date;
  createdAt: Date;
};

export type MongoPasswordResetDocument = {
  _id: string;
  userId: string;
  selector: string;
  verifierHash: string;
  expiresAt: Date;
  createdAt: Date;
};

export type MongoLoginAttemptDocument = {
  _id: string;
  userId: string | null;
  email: string;
  ipAddress: string;
  success: boolean;
  createdAt: Date;
};

export type MongoOAuthStateDocument = {
  _id: string;
  providerId: string;
  state: string;
  codeVerifier: string | null;
  redirectUri: string | null;
  nativeClientId: string | null;
  nativeRedirectUri: string | null;
  nativeCodeChallenge: string | null;
  nativeState: string | null;
  nativeAudience?: string | null;
  nativeMaxAgeSeconds?: number | null;
  expiresAt: Date;
  createdAt: Date;
};

export type MongoNativeAuthorizationGrantDocument = {
  _id: string;
  userId: string;
  clientId: string;
  selector: string;
  verifierHash: string;
  redirectUri: string;
  codeChallenge: string;
  requestedAudience?: string | null;
  requestedFreshnessSeconds?: number | null;
  authenticationTime?: Date | null;
  expiresAt: Date;
  createdAt: Date;
};

export type MongoResourceIntrospectionAuditDocument = {
  _id: string;
  resourceServerHash: string | null;
  audienceHash: string | null;
  tokenSelectorHash: string | null;
  sessionId: string | null;
  clientIdHash: string | null;
  sourceIdentityHash: string | null;
  outcome: string;
  createdAt: Date;
};

export type MongoCollectionDocuments = {
  users: MongoUserDocument;
  accounts: MongoAccountDocument;
  sessions: MongoSessionDocument;
  emailVerifications: MongoEmailVerificationDocument;
  passwordResets: MongoPasswordResetDocument;
  loginAttempts: MongoLoginAttemptDocument;
  oauthStates: MongoOAuthStateDocument;
  nativeAuthorizationGrants: MongoNativeAuthorizationGrantDocument;
  resourceIntrospectionAudit: MongoResourceIntrospectionAuditDocument;
};

export type MongoCollectionNames = {
  users: string;
  accounts: string;
  sessions: string;
  emailVerifications: string;
  passwordResets: string;
  loginAttempts: string;
  oauthStates: string;
  nativeAuthorizationGrants: string;
  resourceIntrospectionAudit: string;
};

export const DEFAULT_COLLECTION_NAMES: MongoCollectionNames = {
  users: 'users',
  accounts: 'accounts',
  sessions: 'sessions',
  emailVerifications: 'email_verifications',
  passwordResets: 'password_resets',
  loginAttempts: 'login_attempts',
  oauthStates: 'oauth_states',
  nativeAuthorizationGrants: 'native_authorization_grants',
  resourceIntrospectionAudit: 'resource_introspection_audit',
};
