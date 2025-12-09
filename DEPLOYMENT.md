# Deployment Guide

This guide covers deploying FortressAuth to production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Deployment Options](#deployment-options)
  - [Docker](#docker)
  - [Docker Compose](#docker-compose)
  - [Kubernetes](#kubernetes)
  - [Cloud Platforms](#cloud-platforms)
- [Database Setup](#database-setup)
- [Security Checklist](#security-checklist)
- [Monitoring](#monitoring)

## Prerequisites

- Node.js 20+ (for non-Docker deployments)
- PostgreSQL 14+ or MySQL 8+ (recommended for production)
- SSL/TLS certificate for HTTPS
- Domain name (optional but recommended)

## Environment Variables

Create a `.env` file or set these environment variables:

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/fortressauth
# or for MySQL: mysql://user:password@localhost:3306/fortressauth

# Security
COOKIE_SECURE=true
SESSION_SECRET=your-random-secret-here

# Logging
LOG_LEVEL=info
```

## Deployment Options

### Docker

The Dockerfile uses a multi-stage build with `pnpm deploy` to create an optimized production image with properly built native modules (like better-sqlite3).

#### Build Image

```bash
docker build -f docker/Dockerfile -t fortressauth:latest .
```

#### Run Container with SQLite

```bash
docker run -d \
  --name fortressauth \
  -p 3000:3000 \
  -e DATABASE_URL=/data/fortress.db \
  -e COOKIE_SECURE=true \
  -e NODE_ENV=production \
  -v /path/to/data:/data \
  fortressauth:latest
```

#### Run Container with PostgreSQL/MySQL

```bash
docker run -d \
  --name fortressauth \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:password@host:5432/fortressauth \
  -e COOKIE_SECURE=true \
  -e NODE_ENV=production \
  fortressauth:latest
```

**Note**: The container uses a non-root user (`fortress:fortress`) for security. The `/data` directory is pre-created with proper permissions for SQLite databases.

### Docker Compose

#### Production Configuration

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  fortressauth:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/fortressauth
      - COOKIE_SECURE=true
    depends_on:
      - db
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=fortressauth
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=your-secure-password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - fortressauth
    restart: unless-stopped

volumes:
  postgres_data:
```

#### Deploy

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes

#### Create Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fortressauth
spec:
  replicas: 3
  selector:
    matchLabels:
      app: fortressauth
  template:
    metadata:
      labels:
        app: fortressauth
    spec:
      containers:
      - name: fortressauth
        image: idmcalculus/fortressauth:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: fortressauth-secrets
              key: database-url
        - name: COOKIE_SECURE
          value: "true"
        - name: NODE_ENV
          value: "production"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: fortressauth
spec:
  selector:
    app: fortressauth
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

Apply:

```bash
kubectl apply -f k8s/deployment.yaml
```

### Cloud Platforms

#### AWS (ECS/Fargate)

1. Push image to ECR
2. Create ECS task definition
3. Create ECS service with ALB
4. Configure RDS PostgreSQL
5. Set environment variables in task definition

#### Google Cloud (Cloud Run)

```bash
# Build and push
gcloud builds submit --tag gcr.io/PROJECT_ID/fortressauth

# Deploy
gcloud run deploy fortressauth \
  --image gcr.io/PROJECT_ID/fortressauth \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL=postgresql://...,COOKIE_SECURE=true
```

#### Azure (Container Instances)

```bash
az container create \
  --resource-group myResourceGroup \
  --name fortressauth \
  --image idmcalculus/fortressauth:latest \
  --dns-name-label fortressauth \
  --ports 3000 \
  --environment-variables \
    DATABASE_URL=postgresql://... \
    COOKIE_SECURE=true \
    NODE_ENV=production
```

#### Heroku

```bash
# Create app
heroku create fortressauth

# Add PostgreSQL
heroku addons:create heroku-postgresql:standard-0

# Deploy
git push heroku main

# Set environment variables
heroku config:set COOKIE_SECURE=true NODE_ENV=production
```

#### Railway

1. Connect GitHub repository
2. Add PostgreSQL plugin
3. Set environment variables in dashboard
4. Deploy automatically on push

#### Render

1. Create new Web Service
2. Connect GitHub repository
3. Add PostgreSQL database
4. Set environment variables
5. Deploy

## Database Setup

### PostgreSQL

```sql
-- Create database
CREATE DATABASE fortressauth;

-- Create user
CREATE USER fortressauth WITH PASSWORD 'your-secure-password';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE fortressauth TO fortressauth;
```

### MySQL

```sql
-- Create database
CREATE DATABASE fortressauth CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create user
CREATE USER 'fortressauth'@'%' IDENTIFIED BY 'your-secure-password';

-- Grant privileges
GRANT ALL PRIVILEGES ON fortressauth.* TO 'fortressauth'@'%';
FLUSH PRIVILEGES;
```

### Run Migrations

Migrations run automatically on server startup. To run manually:

```typescript
import { up } from '@fortressauth/adapter-sql';
await up(db);
```

## Security Checklist

- [ ] Use HTTPS/TLS in production
- [ ] Set `COOKIE_SECURE=true`
- [ ] Set `NODE_ENV=production`
- [ ] Use strong database passwords
- [ ] Enable database SSL/TLS
- [ ] Configure CORS for your domain
- [ ] Set up rate limiting at reverse proxy level
- [ ] Enable database backups
- [ ] Use environment variables for secrets
- [ ] Implement monitoring and alerting
- [ ] Keep dependencies updated
- [ ] Use a Web Application Firewall (WAF)
- [ ] Implement DDoS protection
- [ ] Set up log aggregation
- [ ] Configure security headers (CSP, HSTS, etc.)

## Monitoring

### Health Checks

The `/health` endpoint returns server status:

```bash
curl https://your-domain.com/health
```

### Metrics

Consider adding:
- Prometheus metrics
- Application Performance Monitoring (APM)
- Error tracking (Sentry, Rollbar)
- Log aggregation (ELK, Datadog)

### Alerts

Set up alerts for:
- High error rates
- Database connection failures
- High response times
- Failed health checks
- High CPU/memory usage

## Backup and Recovery

### Database Backups

#### PostgreSQL

```bash
# Backup
pg_dump -U fortressauth fortressauth > backup.sql

# Restore
psql -U fortressauth fortressauth < backup.sql
```

#### MySQL

```bash
# Backup
mysqldump -u fortressauth -p fortressauth > backup.sql

# Restore
mysql -u fortressauth -p fortressauth < backup.sql
```

### Automated Backups

Set up automated daily backups using:
- Cloud provider backup services
- Cron jobs with backup scripts
- Database replication for high availability

## Scaling

### Horizontal Scaling

FortressAuth is stateless and can be scaled horizontally:

1. Run multiple instances behind a load balancer
2. Use a shared database (PostgreSQL/MySQL)
3. Consider Redis for rate limiting (future feature)

### Vertical Scaling

- Increase CPU/memory for the application
- Scale database resources
- Optimize database indexes

## Troubleshooting

### Common Issues

**Database connection errors**
- Check DATABASE_URL format
- Verify database is running
- Check network connectivity
- Verify credentials

**Cookie not being set**
- Ensure COOKIE_SECURE matches your HTTPS setup
- Check CORS configuration
- Verify domain settings

**High memory usage**
- Rate limiter stores data in memory
- Consider Redis adapter for production
- Monitor and adjust limits

## Support

For issues and questions:
- GitHub Issues: https://github.com/idmcalculus/fortressauth/issues
- Documentation: https://github.com/idmcalculus/fortressauth
