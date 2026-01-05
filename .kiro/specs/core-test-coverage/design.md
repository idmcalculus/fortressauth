# Design Document: Core Test Coverage Improvements

## Overview

This design document describes the test additions needed to achieve 100% test coverage in `packages/core`. The current coverage is 97.45% with specific uncovered lines identified in the v8 coverage report.

## Architecture

The tests will be added to the existing test structure in `packages/core/src/__tests__/`. No architectural changes are needed - this is purely additive test coverage.

```
packages/core/src/__tests__/
├── domain/entities/
│   ├── email-verification-token.test.ts  # Add rehydrate tests
│   └── password-reset-token.test.ts      # Add rehydrate tests (new file)
├── security/
│   ├── tokens.test.ts                    # Add constantTimeEqual tests (new file)
│   └── breached-password.test.ts         # Add timeout tests
├── schemas/
│   └── config.test.ts                    # Add URL config tests
└── fortress.test.ts                      # Add edge case tests
```

## Components and Interfaces

### Uncovered Code Analysis

| File | Line(s) | Code Path | Test Needed |
|------|---------|-----------|-------------|
| `email-verification-token.ts` | 47 | `rehydrate()` static method | Entity reconstruction test |
| `password-reset-token.ts` | 37 | `rehydrate()` static method | Entity reconstruction test |
| `tokens.ts` | 33 | `constantTimeEqual` length check | Different length string comparison |
| `breached-password.ts` | 52 | AbortController timeout path | Timeout handling test |
| `config.ts` | 175 | URL config default fallback | Default URL config test |
| `fortress.ts` | 153 | Password reset verifier mismatch | Invalid verifier test |
| `fortress.ts` | 186 | Password reset expired token | Expired token test |
| `fortress.ts` | 213-215 | Breached password during reset | Breached password rejection |
| `fortress.ts` | 220-223 | Account not found during reset | Missing account test |
| `fortress.ts` | 422 | Rate limit logging | Rate limit violation logging |

## Data Models

No new data models are needed. Tests will use existing entity structures.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: EmailVerificationToken Rehydration Round-Trip

*For any* valid EmailVerificationToken data (id, userId, selector, verifierHash, expiresAt, createdAt), calling `EmailVerificationToken.rehydrate()` SHALL produce a token instance where all properties match the input data exactly.

**Validates: Requirements 1.1**

### Property 2: PasswordResetToken Rehydration Round-Trip

*For any* valid PasswordResetToken data (id, userId, selector, verifierHash, expiresAt, createdAt), calling `PasswordResetToken.rehydrate()` SHALL produce a token instance where all properties match the input data exactly.

**Validates: Requirements 1.2**

### Property 3: Constant-Time Comparison Correctness

*For any* two strings A and B, `constantTimeEqual(A, B)` SHALL return true if and only if A and B have the same length AND identical content. When lengths differ, it SHALL return false immediately.

**Validates: Requirements 2.1, 2.2**

## Error Handling

Tests will verify that:
- `PASSWORD_RESET_INVALID` is returned for verifier mismatches
- `PASSWORD_RESET_EXPIRED` is returned for expired tokens
- `PASSWORD_TOO_WEAK` is returned for breached passwords during reset
- `SESSION_INVALID` is returned for signOut verifier mismatches
- `RATE_LIMIT_EXCEEDED` is returned when rate limits are exceeded

## Testing Strategy

### Test Framework

- **Library**: Vitest (already configured in the project)
- **Mocking**: Vitest's `vi.fn()` and `vi.mock()` for dependencies
- **Coverage**: v8 coverage provider

### Test Files to Create/Modify

1. **New File**: `packages/core/src/__tests__/domain/entities/email-verification-token.test.ts`
   - Test `rehydrate()` method

2. **New File**: `packages/core/src/__tests__/domain/entities/password-reset-token.test.ts`
   - Test `rehydrate()` method

3. **New File**: `packages/core/src/__tests__/security/tokens.test.ts`
   - Test `constantTimeEqual()` with different length strings
   - Test `constantTimeEqual()` with same length, different content

4. **Modify**: `packages/core/src/__tests__/security/breached-password.test.ts`
   - Add timeout/abort handling test

5. **Modify**: `packages/core/src/__tests__/schemas/config.test.ts`
   - Add URL config default test

6. **Modify**: `packages/core/src/__tests__/fortress.test.ts`
   - Add password reset verifier mismatch test
   - Add password reset expired token test
   - Add breached password during reset test
   - Add signOut verifier mismatch test

### Property-Based Testing

Property tests will use Vitest with manual iteration for the rehydration round-trip properties:

```typescript
// Example: Property 1 - EmailVerificationToken Rehydration
describe('Property 1: EmailVerificationToken Rehydration Round-Trip', () => {
  it('should preserve all properties when rehydrating', () => {
    const data = {
      id: 'test-id',
      userId: 'user-123',
      selector: 'abc123',
      verifierHash: 'hash456',
      expiresAt: new Date('2025-01-15'),
      createdAt: new Date('2025-01-01'),
    };
    
    const token = EmailVerificationToken.rehydrate(data);
    
    expect(token.id).toBe(data.id);
    expect(token.userId).toBe(data.userId);
    expect(token.selector).toBe(data.selector);
    expect(token.verifierHash).toBe(data.verifierHash);
    expect(token.expiresAt).toEqual(data.expiresAt);
    expect(token.createdAt).toEqual(data.createdAt);
  });
});
```

### Coverage Target

After implementing these tests, the coverage should reach 100% for all files in `packages/core/src/`.
