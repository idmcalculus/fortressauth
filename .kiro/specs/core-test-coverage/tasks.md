# Implementation Plan: Core Test Coverage Improvements

## Overview

This implementation plan covers adding tests to achieve 100% coverage in `packages/core`. Tasks are organized to address each uncovered code path systematically.

## Tasks

- [x] 1. Add Entity Rehydration Tests
  - [x] 1.1 Create email-verification-token.test.ts with rehydrate test
    - Test that `EmailVerificationToken.rehydrate()` preserves all properties
    - Verify id, userId, selector, verifierHash, expiresAt, createdAt are preserved
    - _Requirements: 1.1_

  - [x] 1.2 Create password-reset-token.test.ts with rehydrate test
    - Test that `PasswordResetToken.rehydrate()` preserves all properties
    - Verify id, userId, selector, verifierHash, expiresAt, createdAt are preserved
    - _Requirements: 1.2_

- [x] 2. Add Token Security Tests
  - [x] 2.1 Create tokens.test.ts with constantTimeEqual tests
    - Test `constantTimeEqual()` returns false for different length strings
    - Test `constantTimeEqual()` returns false for same length, different content
    - Test `constantTimeEqual()` returns true for identical strings
    - _Requirements: 2.1, 2.2_

- [x] 3. Add Breached Password Timeout Test
  - [x] 3.1 Add timeout handling test to breached-password.test.ts
    - Mock a slow fetch that triggers AbortController timeout
    - Verify function returns false (fail open) on timeout
    - _Requirements: 3.1, 3.2_

- [x] 4. Add Configuration Default Tests
  - [x] 4.1 Add URL config default test to config.test.ts
    - Test that empty urls config gets default baseUrl
    - Verify default is 'http://localhost:3000'
    - _Requirements: 4.1, 4.2_

- [x] 5. Add FortressAuth Edge Case Tests
  - [x] 5.1 Add password reset verifier mismatch test
    - Create a valid token, call resetPassword with wrong verifier
    - Verify PASSWORD_RESET_INVALID is returned
    - Verify token is deleted from repository
    - _Requirements: 5.1_

  - [x] 5.2 Add password reset expired token test
    - Create an expired token (negative TTL)
    - Call resetPassword and verify PASSWORD_RESET_EXPIRED is returned
    - _Requirements: 5.2_

  - [x] 5.3 Add breached password during reset test
    - Enable breached password checking in config
    - Mock HIBP API to return a match
    - Call resetPassword and verify PASSWORD_TOO_WEAK is returned
    - _Requirements: 5.3_

  - [x] 5.4 Add signOut verifier mismatch test
    - Create a valid session
    - Call signOut with correct selector but wrong verifier
    - Verify SESSION_INVALID is returned
    - _Requirements: 5.4_

- [x] 6. Checkpoint - Verify 100% Coverage
  - Run `pnpm test:coverage` in packages/core
  - Verify all files show 100% line coverage
  - Ensure all tests pass

## Notes

- All tests use Vitest (already configured)
- Tests should follow existing patterns in the codebase
- Mock external dependencies (fetch, repository) as needed
- Each test file should be co-located with existing test structure
