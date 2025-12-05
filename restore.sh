#!/bin/bash
set -e

# Configuration
APP_DIR="/home/ubuntu/viali"
BACKUP_DIR="/home/ubuntu/backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${RED}========================================${NC}"
echo -e "${RED}  Viali Rollback / Restore${NC}"
echo -e "${RED}========================================${NC}"

cd $APP_DIR

# Load database credentials from ecosystem.config.cjs
echo -e "${YELLOW}Loading database credentials from ecosystem.config.cjs...${NC}"
eval $(node -e "
const c = require('$APP_DIR/ecosystem.config.cjs');
const dbUrl = c.apps[0].env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not found in ecosystem.config.cjs');
  process.exit(1);
}
// Parse: postgresql://user:password@host:port/database
const match = dbUrl.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (match) {
  console.log('export PGUSER=\"' + match[1] + '\"');
  console.log('export PGPASSWORD=\"' + match[2] + '\"');
  console.log('export PGHOST=\"' + match[3] + '\"');
  console.log('export PGPORT=\"' + match[4] + '\"');
  console.log('export PGDATABASE=\"' + match[5].split('?')[0] + '\"');
}
")

# Verify database credentials are loaded
if [ -z "$PGHOST" ] || [ -z "$PGUSER" ] || [ -z "$PGDATABASE" ]; then
    echo -e "${RED}Error: Could not parse DATABASE_URL from ecosystem.config.cjs${NC}"
    exit 1
fi
echo -e "${GREEN}Database credentials loaded successfully.${NC}"

# Check if backup files exist
if [ ! -f "$BACKUP_DIR/last_backup.txt" ] || [ ! -f "$BACKUP_DIR/last_commit.txt" ]; then
    echo -e "${RED}Error: No backup information found.${NC}"
    echo "Make sure you have run deploy.sh at least once."
    exit 1
fi

BACKUP_FILE=$(cat "$BACKUP_DIR/last_backup.txt")
ROLLBACK_COMMIT=$(cat "$BACKUP_DIR/last_commit.txt")
DEPLOY_DATE=$(cat "$BACKUP_DIR/last_deploy_date.txt" 2>/dev/null || echo "unknown")

# Verify backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}This will restore to the state BEFORE the last deployment:${NC}"
echo -e "  Deployment date: $DEPLOY_DATE"
echo -e "  Git commit:      $ROLLBACK_COMMIT"
echo -e "  Database backup: $BACKUP_FILE"
echo ""
read -p "Are you sure you want to rollback? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${YELLOW}Rollback cancelled.${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}[1/4] Stopping application...${NC}"
pm2 stop ecosystem.config.cjs || true

echo -e "${YELLOW}[2/4] Restoring database...${NC}"
pg_restore -h $PGHOST -U $PGUSER -d $PGDATABASE --clean --if-exists "$BACKUP_FILE"
echo -e "${GREEN}      Database restored from: $BACKUP_FILE${NC}"

echo -e "${YELLOW}[3/4] Rolling back code to commit: $ROLLBACK_COMMIT${NC}"
git fetch origin
git reset --hard $ROLLBACK_COMMIT

echo -e "${YELLOW}[4/4] Rebuilding and restarting application...${NC}"
npm ci
NODE_OPTIONS='--max-old-space-size=1536' npm run build
pm2 start ecosystem.config.cjs --update-env

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Rollback complete!${NC}"
echo -e "${GREEN}  Restored to commit: $ROLLBACK_COMMIT${NC}"
echo -e "${GREEN}  Database restored from: $BACKUP_FILE${NC}"
echo -e "${GREEN}========================================${NC}"
