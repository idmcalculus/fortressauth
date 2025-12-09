# FortressAuth Basic Usage Example

This example demonstrates the core functionality of FortressAuth.

## Running the Example

From the repository root:

```bash
# Install dependencies
pnpm install

# Build packages
pnpm build

# Run example
node examples/basic-usage/index.js
```

## What This Example Covers

1. **Database Setup**: Initialize SQLite database with migrations
2. **User Signup**: Create a new user account with password
3. **Session Validation**: Validate an active session token
4. **User Sign In**: Authenticate with email and password
5. **Failed Login**: Handle incorrect credentials
6. **Sign Out**: Invalidate a session
7. **Expired Session**: Verify session is no longer valid after sign out

## Expected Output

```
🏰 FortressAuth Example

✅ Database initialized

📝 Signing up user...
✅ User created: {
  id: '01234567-89ab-cdef-0123-456789abcdef',
  email: 'alice@example.com',
  emailVerified: false
}
🔑 Session token: a1b2c3d4e5f6g7h8i9j0...

🔍 Validating session...
✅ Session valid for user: alice@example.com

🔐 Signing in...
✅ Signed in successfully
🔑 New session token: k1l2m3n4o5p6q7r8s9t0...

❌ Attempting login with wrong password...
✅ Login correctly rejected: INVALID_CREDENTIALS

👋 Signing out...
✅ Signed out successfully

🔍 Validating signed-out session...
✅ Session correctly invalidated: SESSION_INVALID

✨ Example completed successfully!
```

## Next Steps

- Check out the [HTTP server example](../server-integration)
- Read the [full documentation](../../README.md)
- Explore the [API reference](../../packages/core/README.md)
