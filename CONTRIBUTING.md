# Contributing to FortressAuth

Thank you for your interest in contributing to FortressAuth! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful, inclusive, and professional in all interactions.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Git

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/idmcalculus/fortressauth.git
   cd fortressauth
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Build packages:
   ```bash
   pnpm build
   ```
5. Run tests:
   ```bash
   pnpm test
   ```

## Development Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions/updates

### Making Changes

1. Create a new branch:
   ```bash
   git checkout -b feature/your-feature
   ```

2. Make your changes following our coding standards

3. Write/update tests:
   ```bash
   pnpm test
   ```

4. Ensure code quality:
   ```bash
   pnpm lint
   pnpm typecheck
   ```

5. Commit your changes:
   ```bash
   git commit -m "feat: add new feature"
   ```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Test additions/updates
- `chore:` - Maintenance tasks

Examples:
```
feat: add OAuth provider support
fix: resolve session expiration bug
docs: update deployment guide
test: add rate limiter edge cases
```

### Pull Requests

1. Push your branch:
   ```bash
   git push origin feature/your-feature
   ```

2. Create a Pull Request on GitHub

3. Fill out the PR template with:
   - Description of changes
   - Related issues
   - Testing performed
   - Screenshots (if applicable)

4. Wait for review and address feedback

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Explicit return types on functions
- No `any` type (use `unknown` if needed)
- Prefer interfaces for public APIs
- Use type guards for runtime checks

### Architecture

- Follow hexagonal architecture principles
- Keep business logic in core package
- Adapters implement port interfaces
- No infrastructure dependencies in core

### Error Handling

- Use Result pattern (no throwing for expected errors)
- Throw only for unexpected/unrecoverable errors
- Provide descriptive error messages

### Testing

- Write tests for all new features
- Maintain 90%+ code coverage
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

Example:
```typescript
describe('Feature', () => {
  it('should do something when condition is met', () => {
    // Arrange
    const input = createTestInput();
    
    // Act
    const result = doSomething(input);
    
    // Assert
    expect(result).toBe(expected);
  });
});
```

### Documentation

- Update README for user-facing changes
- Add JSDoc comments for public APIs
- Update DEPLOYMENT.md for deployment changes
- Include code examples where helpful

## Project Structure

```
fortressauth/
├── packages/
│   ├── core/           # Business logic
│   ├── adapter-sql/    # SQL adapter
│   └── server/         # HTTP server
├── docker/             # Docker configuration
├── .github/            # GitHub Actions
└── docs/               # Documentation
```

## Testing

### Unit Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

### Integration Tests

Integration tests are in `__tests__` directories alongside source files.

### Manual Testing

```bash
# Start development server
cd packages/server
pnpm dev

# Test endpoints
curl http://localhost:3000/health
```

## Release Process

Maintainers handle releases:

1. Update version in package.json files
2. Update CHANGELOG.md
3. Create git tag: `git tag v0.2.0`
4. Push tag: `git push origin v0.2.0`
5. GitHub Actions publishes to npm

## Getting Help

- Check existing issues and discussions
- Ask questions in GitHub Discussions
- Join our community chat (if available)

## Areas for Contribution

### High Priority

- OAuth provider implementations
- Email verification flow
- Password reset functionality
- Redis rate limiter adapter

### Medium Priority

- Additional database adapters
- Multi-factor authentication
- Session management UI
- Audit logging

### Documentation

- More deployment examples
- Tutorial videos
- API reference improvements
- Translation to other languages

## Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation

Thank you for contributing to FortressAuth!
