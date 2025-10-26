# Viali Deployment Guide for Exoscale

This guide covers deploying Viali with the new background worker system for reliable bulk image processing on Exoscale.

## Overview

The bulk import system now uses a background worker architecture to handle large batches of images (50+) reliably:

- **Main Application**: Handles web requests and queues import jobs
- **Background Worker**: Processes import jobs asynchronously with progress tracking
- **Database**: PostgreSQL for job queue and progress tracking
- **nginx**: Web server with proper timeout configuration

## Prerequisites

- Exoscale compute instance (Ubuntu/Debian recommended)
- Node.js 18+ and npm installed
- PostgreSQL database
- nginx web server
- PM2 process manager
- SSL certificate (recommended)

## 1. Database Migration

The new system requires additional columns in the `import_jobs` table for progress tracking.

### Update the Schema

The schema changes are already in `shared/schema.ts`. To apply them:

```bash
# Navigate to your project directory
cd /path/to/viali

# Push schema changes to the database
npm run db:push --force
```

This adds the following fields to `import_jobs`:
- `currentImage` (integer): Current image being processed
- `progressPercent` (integer): Processing progress percentage

## 2. nginx Configuration

Update your nginx configuration to handle longer processing times for large uploads.

### Edit nginx Site Configuration

File: `/etc/nginx/sites-available/viali` (or your site config)

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /path/to/ssl/fullchain.pem;
    ssl_certificate_key /path/to/ssl/privkey.pem;

    # IMPORTANT: Increase client body size for bulk image uploads
    # Allow up to 100MB for ~50 images (2MB each)
    client_max_body_size 100M;

    # IMPORTANT: Increase timeouts to handle initial upload + job queuing
    # The actual processing happens in background, but upload can take time
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # Headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Test and Reload nginx

```bash
# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

## 3. Environment Variables

Ensure all required environment variables are set. Create or update `.env` file:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/viali

# OpenAI API
OPENAI_API_KEY=sk-...

# Email (Resend)
RESEND_API_KEY=re_...

# Application URL (for email links)
VITE_PUBLIC_URL=https://your-domain.com

# Node environment
NODE_ENV=production
```

## 4. PM2 Setup

PM2 will manage both the main application and the background worker.

### Install PM2 Globally

```bash
npm install -g pm2
```

### Start Both Processes

The project includes `ecosystem.config.js` which defines both processes:

```bash
# Start both app and worker
pm2 start ecosystem.config.js

# View status
pm2 status

# View logs
pm2 logs

# View worker logs specifically
pm2 logs viali-worker

# View app logs specifically
pm2 logs viali-app
```

### PM2 Startup Script (Auto-restart on Reboot)

```bash
# Generate startup script
pm2 startup

# Follow the instructions to run the generated command
# Then save the current process list
pm2 save
```

### PM2 Management Commands

```bash
# Restart all processes
pm2 restart all

# Restart just the worker
pm2 restart viali-worker

# Restart just the app
pm2 restart viali-app

# Stop all
pm2 stop all

# View detailed process info
pm2 show viali-worker
pm2 show viali-app

# Monitor resource usage
pm2 monit
```

## 5. Deployment Workflow

Here's the complete workflow for deploying updates:

```bash
# 1. Pull latest code
cd /path/to/viali
git pull origin main

# 2. Install dependencies
npm install

# 3. Apply database migrations (if schema changed)
npm run db:push --force

# 4. Restart PM2 processes
pm2 restart all

# 5. Check logs for any errors
pm2 logs --lines 50
```

## 6. Monitoring and Troubleshooting

### Check System Status

```bash
# Check PM2 processes
pm2 status

# Check nginx status
sudo systemctl status nginx

# Check PostgreSQL status
sudo systemctl status postgresql

# View recent logs
pm2 logs --lines 100
```

### Common Issues

#### Issue: Worker not processing jobs

**Check worker status:**
```bash
pm2 logs viali-worker --lines 50
```

**Restart worker:**
```bash
pm2 restart viali-worker
```

#### Issue: Jobs stuck in "processing" status

The worker automatically detects and fails stuck jobs after 30 minutes. Check the logs:

```bash
pm2 logs viali-worker | grep -i stuck
```

Manually fix stuck jobs via PostgreSQL:
```sql
-- Connect to database
psql -U viali_user -d viali

-- Find stuck jobs
SELECT id, status, "startedAt", "totalImages" 
FROM import_jobs 
WHERE status = 'processing' 
AND "startedAt" < NOW() - INTERVAL '30 minutes';

-- Mark as failed
UPDATE import_jobs 
SET status = 'failed', 
    error = 'Job manually failed - was stuck',
    "completedAt" = NOW()
WHERE status = 'processing' 
AND "startedAt" < NOW() - INTERVAL '30 minutes';
```

#### Issue: nginx 413 errors (Request Entity Too Large)

Increase `client_max_body_size` in nginx config:
```nginx
client_max_body_size 100M;
```

Then reload:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

#### Issue: OpenAI API rate limits

The worker processes images in batches of 3 to stay within rate limits. If you hit limits:

1. Check your OpenAI usage dashboard
2. Consider upgrading your OpenAI plan
3. The worker will automatically retry failed jobs

### Monitoring Worker Health

Create a simple health check script:

```bash
#!/bin/bash
# Save as /path/to/viali/scripts/check-worker.sh

WORKER_STATUS=$(pm2 jlist | jq '.[] | select(.name=="viali-worker") | .pm2_env.status')

if [ "$WORKER_STATUS" != "\"online\"" ]; then
    echo "Worker is not running! Status: $WORKER_STATUS"
    pm2 restart viali-worker
    echo "Worker restarted"
else
    echo "Worker is healthy"
fi
```

Add to crontab for automated monitoring:
```bash
# Check worker every 5 minutes
*/5 * * * * /path/to/viali/scripts/check-worker.sh >> /var/log/viali-health.log 2>&1
```

## 7. Log Management

PM2 logs can grow large. Set up log rotation:

```bash
# Install PM2 log rotate
pm2 install pm2-logrotate

# Configure (keep 7 days of logs, max 100MB)
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

## 8. Performance Optimization

### For High-Volume Usage

If you process many bulk imports:

1. **Increase worker instances** (if you have multiple CPU cores):
   ```javascript
   // In ecosystem.config.js, change:
   instances: 1,
   // to:
   instances: 2, // or more, based on your server
   ```

2. **Tune batch size** (in `server/openai.ts`):
   ```typescript
   const BATCH_SIZE = 3; // Increase if you have higher OpenAI rate limits
   ```

3. **Database connection pooling**: Ensure PostgreSQL is configured for multiple connections

## 9. Security Checklist

- [ ] SSL certificate installed and configured
- [ ] Firewall configured (allow only 80, 443, SSH)
- [ ] Database credentials secured in `.env` file
- [ ] `.env` file not committed to git (in `.gitignore`)
- [ ] Regular security updates: `sudo apt update && sudo apt upgrade`
- [ ] PM2 running as non-root user (recommended)
- [ ] Database backups configured

## 10. Backup Strategy

### Database Backups

Set up automated PostgreSQL backups:

```bash
#!/bin/bash
# Save as /path/to/viali/scripts/backup-db.sh

BACKUP_DIR="/var/backups/viali"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/viali_$DATE.sql.gz"

mkdir -p $BACKUP_DIR
pg_dump -U viali_user viali | gzip > $BACKUP_FILE

# Keep only last 7 days of backups
find $BACKUP_DIR -name "viali_*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE"
```

Add to crontab:
```bash
# Daily backup at 2 AM
0 2 * * * /path/to/viali/scripts/backup-db.sh >> /var/log/viali-backup.log 2>&1
```

## Support

For issues specific to the bulk import system:

1. Check worker logs: `pm2 logs viali-worker`
2. Check app logs: `pm2 logs viali-app`
3. Check nginx logs: `sudo tail -f /var/log/nginx/error.log`
4. Verify database schema is up to date: `npm run db:push`

---

## Quick Reference

```bash
# View all processes
pm2 status

# Restart everything
pm2 restart all

# View live logs
pm2 logs

# Check nginx config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Apply database changes
npm run db:push --force

# Monitor system resources
pm2 monit
```
