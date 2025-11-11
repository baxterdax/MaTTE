# MaTTE Production Deployment Guide

## Production Server Deployment

This guide details how to deploy MaTTE to your production server alongside existing services using Docker and Traefik reverse proxy.

---

## 📋 Current Server Infrastructure

### Existing Services
- **Traefik**: Reverse proxy on ports 80, 443, 8082
- **PostgreSQL**: Running in Docker container (port 5432)
- **Redis**: Running in Docker container (port 6379)
- **Node.js**: v20+
- **Docker**: Latest version
- **Other Apps**: Various applications using internal port 3000

### Available Ports
- Port 3000: Internally used by other containers
- **Recommended for MaTTE**: Port 3001 or 3002 (external)

---

## 🚀 Deployment Steps

### 1. Prepare the Server

```bash
# SSH into production server
ssh -pPORT user@your-server-ip

# Create project directory
mkdir -p ~/apps/matte
cd ~/apps/matte
```

### 2. Clone or Transfer the Repository

```bash
# Option A: Clone from GitHub (once repo is created)
git clone https://github.com/YOUR_USERNAME/matte.git .

# Option B: Transfer files from local machine
# (Run this on your local machine)
rsync -avz -e "ssh -pPORT" \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.git' \
  /path/to/local/matte/ \
  user@your-server-ip:~/apps/matte/
```

### 3. Configure Environment Variables

```bash
# Create .env file
cat > .env << 'EOF'
# MaTTE Environment Configuration
PORT=3001
NODE_ENV=production

# Use existing PostgreSQL (create separate database)
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@172.17.0.1:5432/matte

# Generate encryption key: openssl rand -base64 32
ENCRYPTION_KEY=REPLACE_WITH_32_CHAR_KEY

# Set secure admin API key
ADMIN_API_KEY=REPLACE_WITH_SECURE_KEY

# Rate limiting
MAX_REQUESTS_PER_MINUTE=100
LOG_LEVEL=info

# Optional: Use shared Redis (if needed for queuing)
REDIS_URL=redis://172.17.0.1:6379
EOF

# Secure the .env file
chmod 600 .env
```

### 4. Create Database in Existing PostgreSQL

```bash
# Connect to PostgreSQL container
docker exec -it postgres-container psql -U postgres

# In PostgreSQL prompt:
CREATE DATABASE matte;
CREATE USER matte_app WITH PASSWORD 'SECURE_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE matte TO matte_app;
\q

# Update DATABASE_URL in .env with the new credentials:
# DATABASE_URL=postgresql://matte_app:SECURE_PASSWORD_HERE@172.17.0.1:5432/matte
```

### 5. Initialize Database Schema

```bash
# Apply schema
docker exec -i postgres-container psql -U postgres -d matte < db/schema.sql
```

### 6. Deploy with Docker (Recommended)

#### Option A: Standalone Docker Container

```bash
# Build the Docker image
docker build -t matte:latest .

# Run the container
docker run -d \
  --name matte-api \
  --restart unless-stopped \
  --network host \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  matte:latest

# Check logs
docker logs -f matte-api
```

#### Option B: Add to Existing Docker Compose

Create `docker-compose.matte.yml`:

```yaml
version: '3.8'

services:
  matte-api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: matte-api
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "3001:3001"
    volumes:
      - ./logs:/app/logs
    labels:
      # Traefik configuration
      - "traefik.enable=true"
      - "traefik.http.routers.matte.rule=Host(`matte.yourdomain.com`)"
      - "traefik.http.routers.matte.entrypoints=websecure"
      - "traefik.http.routers.matte.tls.certresolver=letsencrypt"
      - "traefik.http.services.matte.loadbalancer.server.port=3001"
      
      # Optional: Path-based routing
      # - "traefik.http.routers.matte.rule=Host(`yourdomain.com`) && PathPrefix(`/api/email`)"
      # - "traefik.http.middlewares.matte-strip.stripprefix.prefixes=/api/email"
      # - "traefik.http.routers.matte.middlewares=matte-strip@docker"
    networks:
      - default

networks:
  default:
    external: true
    name: YOUR_TRAEFIK_NETWORK  # Usually something like 'proxy' or 'traefik'
```

Deploy:

```bash
docker-compose -f docker-compose.matte.yml up -d
```

### 7. Direct Node.js Deployment (Alternative)

If you prefer running Node.js directly:

```bash
# Install dependencies
npm install --production

# Build TypeScript
npm run build

# Run with PM2 for process management
npm install -g pm2

# Start the application
pm2 start dist/index.js \
  --name matte-api \
  --env production \
  --max-memory-restart 500M

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup

# View logs
pm2 logs matte-api
```

---

## 🌐 Traefik Configuration

### Method 1: Docker Labels (Recommended)

If using Docker deployment, Traefik will automatically discover the service via labels in the docker-compose file above.

**Required:**
- Update `matte.yourdomain.com` to your actual subdomain
- Ensure DNS points to your server
- Verify Traefik network name matches your setup

### Method 2: Dynamic Configuration File

Create `/etc/traefik/dynamic/matte.yml`:

```yaml
http:
  routers:
    matte:
      rule: "Host(`matte.yourdomain.com`)"
      service: matte-service
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
      middlewares:
        - matte-ratelimit

  services:
    matte-service:
      loadBalancer:
        servers:
          - url: "http://localhost:3001"

  middlewares:
    matte-ratelimit:
      rateLimit:
        average: 100
        burst: 50
        period: 1m
```

Reload Traefik:

```bash
docker restart traefik
```

### Method 3: Path-Based Routing

If you want MaTTE under a path like `yourdomain.com/api/email`:

```yaml
http:
  routers:
    matte:
      rule: "Host(`yourdomain.com`) && PathPrefix(`/api/email`)"
      service: matte-service
      entryPoints:
        - websecure
      middlewares:
        - matte-strip-prefix
      tls:
        certResolver: letsencrypt

  services:
    matte-service:
      loadBalancer:
        servers:
          - url: "http://localhost:3001"

  middlewares:
    matte-strip-prefix:
      stripPrefix:
        prefixes:
          - "/api/email"
```

---

## 🔍 Verification

### 1. Check Service Status

```bash
# Docker
docker ps | grep matte
docker logs matte-api

# PM2
pm2 status
pm2 logs matte-api

# Check port
netstat -tuln | grep 3001
# or
ss -tuln | grep 3001
```

### 2. Test Health Endpoint

```bash
# Local test
curl http://localhost:3001/health

# Via Traefik (if configured)
curl https://matte.yourdomain.com/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-11T..."
}
```

### 3. Test API Functionality

Generate encryption key first:
```bash
openssl rand -base64 32
```

Create a test tenant:
```bash
curl -X POST http://localhost:3001/tenants \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: YOUR_ADMIN_API_KEY" \
  -d '{
    "name": "Test Client",
    "smtp_host": "smtp.gmail.com",
    "smtp_port": "587",
    "smtp_user": "your-email@gmail.com",
    "smtp_pass": "your-app-password",
    "smtp_secure": "false",
    "from_email": "your-email@gmail.com"
  }'
```

Send a test email:
```bash
curl -X POST http://localhost:3001/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: TENANT_API_KEY_FROM_ABOVE" \
  -d '{
    "to": "recipient@example.com",
    "subject": "Test Email from MaTTE",
    "htmlBody": "<h1>Success!</h1><p>MaTTE is working on production.</p>",
    "textBody": "Success! MaTTE is working on production."
  }'
```

---

## 🔐 Security Considerations

### 1. Firewall Rules

```bash
# Ensure port 3001 is only accessible locally (not needed if using Traefik)
sudo ufw status
# Port 3001 should NOT be exposed externally
# Only Traefik (80/443) should be public
```

### 2. Secure Credentials

```bash
# Protect .env file
chmod 600 ~/apps/matte/.env

# Rotate API keys periodically
# Update ADMIN_API_KEY and ENCRYPTION_KEY as needed
```

### 3. SSL/TLS

Traefik handles SSL automatically with Let's Encrypt. Ensure:
- DNS is properly configured
- Port 80/443 are accessible for ACME challenges
- Certificate resolver is configured in Traefik

### 4. Rate Limiting

Already configured in the application (100 req/min per tenant).
Additional rate limiting can be added in Traefik config.

---

## 📊 Monitoring

### View Logs

```bash
# Docker logs
docker logs -f matte-api --tail 100

# PM2 logs
pm2 logs matte-api

# Application logs
tail -f ~/apps/matte/logs/combined.log
tail -f ~/apps/matte/logs/error.log
```

### Database Monitoring

```bash
# Check database connections
docker exec postgres-container psql -U postgres -d matte -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'matte';"

# Check table sizes
docker exec postgres-container psql -U postgres -d matte -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) FROM pg_tables WHERE schemaname = 'public';"
```

### Check Email Logs

```bash
# Check email logs (via psql)
docker exec postgres-container psql -U postgres -d matte -c "SELECT id, to_email, subject, status, created_at FROM email_logs ORDER BY created_at DESC LIMIT 10;"
```

---

## 🔄 Updates and Maintenance

### Update Application

```bash
cd ~/apps/matte

# Pull latest changes (if using git)
git pull origin main

# Rebuild and restart (Docker)
docker-compose -f docker-compose.matte.yml down
docker-compose -f docker-compose.matte.yml up -d --build

# Or restart PM2
npm run build
pm2 restart matte-api
```

### Database Migrations

When schema changes are needed:

```bash
# Backup database
docker exec postgres-container pg_dump -U postgres matte > matte_backup_$(date +%Y%m%d).sql

# Apply new migrations
docker exec -i postgres-container psql -U postgres -d matte < db/migrations/001_new_migration.sql
```

### Backup Strategy

```bash
# Create backup script
cat > ~/apps/matte/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=~/backups/matte
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)

# Backup database
docker exec postgres-container pg_dump -U postgres matte | gzip > $BACKUP_DIR/matte_db_$DATE.sql.gz

# Backup logs
tar -czf $BACKUP_DIR/matte_logs_$DATE.tar.gz logs/

# Keep only last 7 days
find $BACKUP_DIR -name "matte_*" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x ~/apps/matte/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * ~/apps/matte/backup.sh") | crontab -
```

---

## 🚨 Troubleshooting

### Issue: Cannot connect to PostgreSQL

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Test connection
docker exec postgres-container psql -U postgres -c "SELECT version();"

# Verify DATABASE_URL in .env
# Should be: postgresql://user:pass@172.17.0.1:5432/matte
# Or use container name if on same Docker network
```

### Issue: Port already in use

```bash
# Check what's using port 3001
sudo lsof -i :3001
# or
sudo ss -tulpn | grep 3001

# Change PORT in .env to another available port (e.g., 3002, 3003)
```

### Issue: Traefik not routing to MaTTE

```bash
# Check Traefik logs
docker logs traefik

# Verify labels on container
docker inspect matte-api | grep -A 10 Labels

# Check Traefik dashboard (if enabled)
# Usually at: http://your-server:8082
```

### Issue: Email sending fails

```bash
# Check logs for SMTP errors
docker logs matte-api | grep -i smtp

# Common issues:
# - Invalid SMTP credentials
# - Firewall blocking outbound port 587/465
# - SMTP server requires app-specific password (Gmail)

# Test SMTP manually
telnet smtp.gmail.com 587
```

### Issue: High memory usage

```bash
# Check container stats
docker stats matte-api

# Restart container
docker restart matte-api

# For PM2
pm2 restart matte-api

# Set memory limits in docker-compose
# Add under matte-api service:
#   deploy:
#     resources:
#       limits:
#         memory: 512M
```

---

## 📝 Quick Reference

### Important Files
- `~/apps/matte/.env` - Environment configuration
- `~/apps/matte/logs/` - Application logs
- `/etc/traefik/dynamic/matte.yml` - Traefik config (if using file-based)

### Common Commands

```bash
# Start service
docker start matte-api
pm2 start matte-api

# Stop service
docker stop matte-api
pm2 stop matte-api

# Restart service
docker restart matte-api
pm2 restart matte-api

# View logs
docker logs -f matte-api
pm2 logs matte-api

# Check status
docker ps | grep matte
pm2 status

# Shell into container
docker exec -it matte-api sh
```

### API Endpoints

- **Health Check**: `GET /health`
- **Create Tenant**: `POST /tenants` (Admin)
- **List Tenants**: `GET /tenants` (Admin)
- **Send Email**: `POST /send` (Tenant)
- **List Emails**: `GET /emails` (Tenant)

### Default Credentials to Change
- `ENCRYPTION_KEY` in `.env`
- `ADMIN_API_KEY` in `.env`
- PostgreSQL password for `matte_app` user

---

## ✅ Post-Deployment Checklist

- [ ] Server has Node.js 20+
- [ ] PostgreSQL database `matte` created
- [ ] Database schema applied
- [ ] `.env` file configured with secure keys
- [ ] Application running (Docker or PM2)
- [ ] Port 3001 responding locally
- [ ] Traefik routing configured
- [ ] SSL certificate obtained
- [ ] Test email sent successfully
- [ ] Logs directory writable
- [ ] Backup script configured
- [ ] Monitoring set up
- [ ] Firewall rules verified
- [ ] Documentation updated with actual domain/credentials

---

## 🎯 Next Steps

1. **Choose a domain**: `matte.yourdomain.com` or path-based routing
2. **Update DNS**: Point subdomain to your server IP
3. **Deploy**: Follow steps 1-7 above
4. **Configure Traefik**: Use Method 1 or 2
5. **Test**: Send test emails
6. **Integrate**: Update your applications to use MaTTE API
7. **Monitor**: Check logs and email delivery

---

## 📞 Support

For issues or questions:
1. Check application logs: `docker logs matte-api`
2. Check database connectivity
3. Verify Traefik routing configuration
4. Review security settings and credentials

**Documentation**: See `README.md` and `DEPLOYMENT.md` for additional details.
