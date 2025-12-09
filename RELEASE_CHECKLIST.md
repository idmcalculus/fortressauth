# Release Checklist for FortressAuth

Use this checklist when preparing to make FortressAuth available to the world.

## Pre-Release Preparation

### Code Quality
- [x] All tests passing (316 tests)
- [x] Test coverage >90% (99%+ achieved)
- [x] No linting errors
- [x] No type errors
- [x] Build succeeds for all packages
- [x] Example code tested

### Documentation
- [x] README.md complete with features and examples
- [x] Package READMEs for core, adapter-sql, and server
- [x] GETTING_STARTED.md guide created
- [x] DEPLOYMENT.md guide created
- [x] CONTRIBUTING.md guidelines created
- [x] PUBLISHING.md instructions created
- [x] API documentation complete
- [x] Code examples provided

### Repository Setup
- [ ] Create GitHub repository
- [ ] Add repository URL to package.json files
- [ ] Update all "idmcalculus" placeholders with actual username
- [ ] Add topics/tags to repository
- [ ] Create repository description
- [ ] Add LICENSE (already exists - MIT)
- [ ] Create .gitattributes if needed

### Package Configuration
- [x] Package.json metadata complete
- [x] Keywords added for npm search
- [x] Files field configured (.npmignore created)
- [x] Exports configured correctly
- [x] Peer dependencies specified
- [x] Version set to 0.1.0

### CI/CD Setup
- [x] GitHub Actions workflows created
  - [x] CI workflow (test, lint, build)
  - [x] Publish workflow (npm + Docker)
- [ ] Add npm token to GitHub secrets (NPM_TOKEN)
- [ ] Add Docker Hub credentials to GitHub secrets
  - [ ] DOCKER_USERNAME
  - [ ] DOCKER_PASSWORD

### Docker
- [x] Dockerfile created and tested
- [x] docker-compose.yml created
- [x] nginx.conf for reverse proxy
- [x] Health checks configured
- [ ] Build multi-platform images
- [ ] Test Docker image locally

## Publishing Steps

### 1. Final Testing
```bash
# Clean install
rm -rf node_modules packages/*/node_modules
pnpm install

# Run all checks
pnpm lint
pnpm typecheck
pnpm build
pnpm test:coverage

# Test Docker build
docker build -f docker/Dockerfile -t fortressauth:test .
docker run -d -p 3000:3000 fortressauth:test
curl http://localhost:3000/health
docker stop $(docker ps -q --filter ancestor=fortressauth:test)
```

### 2. Update Repository URLs
Replace all instances of "idmcalculus" with your actual GitHub username:
- [ ] README.md
- [ ] packages/*/package.json
- [ ] packages/*/README.md
- [ ] DEPLOYMENT.md
- [ ] CONTRIBUTING.md
- [ ] PUBLISHING.md

### 3. Create GitHub Repository
```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit: FortressAuth v0.1.0"

# Create repository on GitHub, then:
git remote add origin https://github.com/idmcalculus/fortressauth.git
git branch -M main
git push -u origin main
```

### 4. Configure GitHub Secrets
Go to repository Settings → Secrets and variables → Actions:
- [ ] Add NPM_TOKEN (from npmjs.com)
- [ ] Add DOCKER_USERNAME
- [ ] Add DOCKER_PASSWORD

### 5. Create npm Account & Packages
- [ ] Create account at npmjs.com
- [ ] Enable 2FA
- [ ] Create access token with publish permissions
- [ ] Verify package names are available:
  - @fortressauth/core
  - @fortressauth/adapter-sql
  - @fortressauth/server

### 6. Create Docker Hub Repository
- [ ] Create account at hub.docker.com
- [ ] Create repository named "fortressauth"
- [ ] Set repository to public

### 7. First Release

#### Option A: Manual Publishing
```bash
# Login to npm
npm login

# Publish packages
cd packages/core && npm publish --access public
cd ../adapter-sql && npm publish --access public
cd ../server && npm publish --access public

# Build and push Docker image
docker build -f docker/Dockerfile -t idmcalculus/fortressauth:0.1.0 .
docker tag idmcalculus/fortressauth:0.1.0 idmcalculus/fortressauth:latest
docker login
docker push idmcalculus/fortressauth:0.1.0
docker push idmcalculus/fortressauth:latest
```

#### Option B: Automated Publishing (Recommended)
```bash
# Create and push tag
git tag v0.1.0
git push origin v0.1.0

# Create GitHub Release
# Go to GitHub → Releases → Create new release
# Select tag v0.1.0
# Add release notes
# Publish release

# GitHub Actions will automatically:
# - Run tests
# - Build packages
# - Publish to npm
# - Build and push Docker image
```

### 8. Verify Publication
- [ ] Check npm packages:
  - https://www.npmjs.com/package/@fortressauth/core
  - https://www.npmjs.com/package/@fortressauth/adapter-sql
  - https://www.npmjs.com/package/@fortressauth/server
- [ ] Check Docker Hub:
  - https://hub.docker.com/r/idmcalculus/fortressauth
- [ ] Test installation:
  ```bash
  npm install @fortressauth/core
  docker pull idmcalculus/fortressauth:latest
  ```

## Post-Release

### Documentation
- [ ] Update README badges with actual links
- [ ] Add link to live demo (if available)
- [ ] Create GitHub Wiki pages
- [ ] Add to awesome lists (awesome-nodejs, awesome-auth, etc.)

### Community
- [ ] Announce on Twitter/X
- [ ] Post on Reddit (r/node, r/typescript, r/programming)
- [ ] Share on Dev.to
- [ ] Post on Hacker News
- [ ] Share in relevant Discord/Slack communities

### Monitoring
- [ ] Set up npm download tracking
- [ ] Monitor GitHub issues
- [ ] Watch for security vulnerabilities
- [ ] Set up Dependabot for dependency updates

### Website (Optional)
- [ ] Create project website
- [ ] Add interactive demo
- [ ] Create video tutorial
- [ ] Add blog posts

## Maintenance

### Regular Tasks
- [ ] Respond to issues within 48 hours
- [ ] Review and merge pull requests
- [ ] Update dependencies monthly
- [ ] Release patches for bugs
- [ ] Release minor versions for features
- [ ] Update documentation as needed

### Security
- [ ] Monitor security advisories
- [ ] Set up security policy (SECURITY.md)
- [ ] Enable GitHub security alerts
- [ ] Respond to security issues immediately

## Marketing Checklist

### Initial Launch
- [ ] Product Hunt launch
- [ ] Hacker News Show HN post
- [ ] Reddit posts in relevant subreddits
- [ ] Twitter/X announcement thread
- [ ] Dev.to article
- [ ] Medium article
- [ ] LinkedIn post

### Content Creation
- [ ] Write tutorial blog posts
- [ ] Create video tutorials
- [ ] Record demo screencast
- [ ] Create comparison with alternatives
- [ ] Write case studies

### SEO
- [ ] Add meta descriptions
- [ ] Create sitemap
- [ ] Submit to search engines
- [ ] Add structured data
- [ ] Optimize for keywords

## Success Metrics

Track these metrics after launch:
- npm downloads per week
- GitHub stars
- GitHub issues/PRs
- Docker pulls
- Website visitors
- Community engagement

## Support Channels

Set up these support channels:
- [ ] GitHub Issues (bug reports)
- [ ] GitHub Discussions (questions)
- [ ] Discord server (optional)
- [ ] Stack Overflow tag
- [ ] Email support

## Future Roadmap

Plan for future releases:
- v0.2.0: OAuth providers
- v0.3.0: Email verification
- v0.4.0: Password reset
- v0.5.0: Multi-factor authentication
- v1.0.0: Production-ready stable release

---

## Quick Commands Reference

```bash
# Development
pnpm install
pnpm build
pnpm test
pnpm lint

# Publishing
npm login
npm publish --access public

# Docker
docker build -f docker/Dockerfile -t fortressauth .
docker push idmcalculus/fortressauth:latest

# Git
git tag v0.1.0
git push origin v0.1.0
```

## Need Help?

- Review PUBLISHING.md for detailed publishing instructions
- Check DEPLOYMENT.md for deployment options
- Read CONTRIBUTING.md for development guidelines
- See GETTING_STARTED.md for usage examples

Good luck with your launch! 🚀
