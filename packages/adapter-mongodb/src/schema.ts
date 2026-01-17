export type MongoUserDocument = {
  _id: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  lockedUntil: Date | null;
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
  expiresAt: Date;
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
};

export type MongoCollectionNames = {
  users: string;
  accounts: string;
  sessions: string;
  emailVerifications: string;
  passwordResets: string;
  loginAttempts: string;
  oauthStates: string;
};

export const DEFAULT_COLLECTION_NAMES: MongoCollectionNames = {
  users: 'users',
  accounts: 'accounts',
  sessions: 'sessions',
  emailVerifications: 'email_verifications',
  passwordResets: 'password_resets',
  loginAttempts: 'login_attempts',
  oauthStates: 'oauth_states',
};
