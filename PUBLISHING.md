# Publishing Guide

This guide covers how to publish FortressAuth packages to npm and deploy the server.

## Prerequisites

### npm Account
1. Create an account at https://www.npmjs.com
2. Enable 2FA for your account
3. Create an access token with publish permissions
4. Add token to GitHub secrets as `NPM_TOKEN`

### Docker Hub Account
1. Create an account at https://hub.docker.com
2. Create a repository named `fortressauth`
3. Add credentials to GitHub secrets:
   - `DOCKER_USERNAME`
   - `DOCKER_PASSWORD`

## Pre-Publishing Checklist

- [ ] All tests passing (`pnpm test`)
- [ ] Coverage above 90% (`pnpm test:coverage`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped in all package.json files
- [ ] README examples tested
- [ ] Docker image builds successfully

## Version Bumping

Update version in all package.json files:

```bash
# packages/core/package.json
# packages/adapter-sql/package.json
# packages/server/package.json
```

Follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

## Manual Publishing

### 1. Build Packages

```bash
pnpm install
pnpm build
```

### 2. Test Packages

```bash
pnpm test
```

### 3. Login to npm

```bash
npm login
```

### 4. Publish Core Package

```bash
cd packages/core
npm publish --access public
```

### 5. Publish Adapter Package

```bash
cd packages/adapter-sql
npm publish --access public
```

### 6. Publish Server Package

```bash
cd packages/server
npm publish --access public
```

## Automated Publishing (Recommended)

### Using GitHub Actions

1. **Create a Release**
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

2. **Create GitHub Release**
   - Go to GitHub repository
   - Click "Releases" → "Create a new release"
   - Select the tag you created
   - Add release notes
   - Publish release

3. **Automated Workflow**
   - GitHub Actions will automatically:
     - Run tests
     - Build packages
     - Publish to npm
     - Build and push Docker image

## Docker Publishing

### Manual Docker Publishing

```bash
# Build image
docker build -f docker/Dockerfile -t idmcalculus/fortressauth:0.2.0 .
docker tag idmcalculus/fortressauth:0.2.0 idmcalculus/fortressauth:latest

# Login to Docker Hub
docker login

# Push images
docker push idmcalculus/fortressauth:0.2.0
docker push idmcalculus/fortressauth:latest
```

### Multi-Platform Build

```bash
# Create builder
docker buildx create --use

# Build and push for multiple platforms
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t idmcalculus/fortressauth:0.2.0 \
  -t idmcalculus/fortressauth:latest \
  --push \
  -f docker/Dockerfile .
```

## Post-Publishing Checklist

- [ ] Verify packages on npm:
  - https://www.npmjs.com/package/@fortressauth/core
  - https://www.npmjs.com/package/@fortressauth/adapter-sql
  - https://www.npmjs.com/package/@fortressauth/server
- [ ] Test installation: `npm install @fortressauth/core`
- [ ] Verify Docker image: `docker pull idmcalculus/fortressauth:latest`
- [ ] Update documentation with new version
- [ ] Announce release on social media/blog
- [ ] Close related GitHub issues
- [ ] Update project roadmap

## Testing Published Packages

### Test npm Packages

```bash
# Create test directory
mkdir test-fortressauth
cd test-fortressauth
npm init -y

# Install packages
npm install @fortressauth/core @fortressauth/adapter-sql

# Create test file
cat > test.js << 'EOF'
import { FortressAuth } from '@fortressauth/core';
console.log('FortressAuth loaded successfully!');
EOF

# Run test
node test.js
```

### Test Docker Image

```bash
# Pull image
docker pull idmcalculus/fortressauth:latest

# Run container
docker run -d -p 3000:3000 idmcalculus/fortressauth:latest

# Test health endpoint
curl http://localhost:3000/health

# Stop container
docker stop $(docker ps -q --filter ancestor=idmcalculus/fortressauth:latest)
```

## Rollback Procedure

If issues are discovered after publishing:

### npm Rollback

```bash
# Deprecate version
npm deprecate @fortressauth/core@0.2.0 "Critical bug, use 0.1.0 instead"

# Or unpublish (within 72 hours)
npm unpublish @fortressauth/core@0.2.0
```

### Docker Rollback

```bash
# Remove tags
docker rmi idmcalculus/fortressauth:0.2.0

# Re-tag previous version as latest
docker tag idmcalculus/fortressauth:0.1.0 idmcalculus/fortressauth:latest
docker push idmcalculus/fortressauth:latest
```

## Troubleshooting

### npm Publish Fails

**Error: 403 Forbidden**
- Check npm token is valid
- Verify 2FA is configured
- Ensure you have publish permissions

**Error: Package already exists**
- Version already published
- Bump version number

### Docker Build Fails

**Error: Cannot find module**
- Run `pnpm install` first
- Check all dependencies are installed

**Error: Platform not supported**
- Use `docker buildx` for multi-platform builds
- Specify platform: `--platform linux/amd64`

## Release Notes Template

```markdown
## v0.2.0 (2024-01-15)

### Features
- Add OAuth provider support
- Implement email verification flow

### Bug Fixes
- Fix session expiration edge case
- Resolve rate limiter memory leak

### Breaking Changes
- Rename `signUp` to `register` (migration guide below)

### Migration Guide
\`\`\`typescript
// Before
await fortress.signUp({ email, password });

// After
await fortress.register({ email, password });
\`\`\`

### Contributors
- @username1
- @username2
```

## Support

For publishing issues:
- Check GitHub Actions logs
- Review npm publish documentation
- Contact maintainers via GitHub Issues
