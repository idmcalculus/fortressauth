#!/usr/bin/env node
import { SqlAdapter, up } from '@fortressauth/adapter-sql';
import { FortressAuth, MemoryRateLimiter } from '@fortressauth/core';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';

async function main() {
  console.log('🏰 FortressAuth Example\n');

  // Setup database
  const sqlite = new Database(':memory:');
  const db = new Kysely({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  // Run migrations
  await up(db);
  console.log('✅ Database initialized');

  // Initialize FortressAuth
  const fortress = new FortressAuth({
    repository: new SqlAdapter(db, { dialect: 'sqlite' }),
    rateLimiter: new MemoryRateLimiter(),
  });

  // Example 1: Sign up a new user
  console.log('\n📝 Signing up user...');
  const signupResult = await fortress.signUp({
    email: 'alice@example.com',
    password: 'SecurePassword123!',
  });

  if (!signupResult.success) {
    console.error('❌ Signup failed:', signupResult.error);
    return;
  }

  const { user, token } = signupResult.data;
  console.log('✅ User created:', {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
  });
  console.log('🔑 Session token:', `${token.substring(0, 20)}...`);

  // Example 2: Validate session
  console.log('\n🔍 Validating session...');
  const sessionResult = await fortress.validateSession(token);

  if (!sessionResult.success) {
    console.error('❌ Session validation failed:', sessionResult.error);
    return;
  }

  console.log('✅ Session valid for user:', sessionResult.data.user.email);

  // Example 3: Sign in
  console.log('\n🔐 Signing in...');
  const signinResult = await fortress.signIn({
    email: 'alice@example.com',
    password: 'SecurePassword123!',
  });

  if (!signinResult.success) {
    console.error('❌ Sign in failed:', signinResult.error);
    return;
  }

  console.log('✅ Signed in successfully');
  console.log('🔑 New session token:', `${signinResult.data.token.substring(0, 20)}...`);

  // Example 4: Failed login attempt
  console.log('\n❌ Attempting login with wrong password...');
  const failedResult = await fortress.signIn({
    email: 'alice@example.com',
    password: 'WrongPassword',
  });

  if (!failedResult.success) {
    console.log('✅ Login correctly rejected:', failedResult.error);
  }

  // Example 5: Sign out
  console.log('\n👋 Signing out...');
  const signoutResult = await fortress.signOut(token);

  if (!signoutResult.success) {
    console.error('❌ Sign out failed:', signoutResult.error);
    return;
  }

  console.log('✅ Signed out successfully');

  // Example 6: Validate expired session
  console.log('\n🔍 Validating signed-out session...');
  const expiredResult = await fortress.validateSession(token);

  if (!expiredResult.success) {
    console.log('✅ Session correctly invalidated:', expiredResult.error);
  }

  // Cleanup
  await db.destroy();
  sqlite.close();

  console.log('\n✨ Example completed successfully!');
}

main().catch(console.error);
