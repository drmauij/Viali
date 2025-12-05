#!/bin/bash
set -e

# Configuration
APP_DIR="/home/ubuntu/viali"
BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  Viali Deployment - $DATE${NC}"
echo -e "${YELLOW}========================================${NC}"

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

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Step 1: Save current git commit for rollback
CURRENT_COMMIT=$(git rev-parse --short HEAD)
echo "$CURRENT_COMMIT" > "$BACKUP_DIR/last_commit.txt"
echo -e "${GREEN}[1/6] Saved current commit: $CURRENT_COMMIT${NC}"

# Step 2: Backup database
echo -e "${YELLOW}[2/6] Backing up database...${NC}"
BACKUP_FILE="$BACKUP_DIR/backup_${DATE}.dump"
pg_dump -h $PGHOST -U $PGUSER -d $PGDATABASE -Fc -f "$BACKUP_FILE"
echo -e "${GREEN}      Database backed up to: $BACKUP_FILE${NC}"

# Save backup filename for restore script
echo "$BACKUP_FILE" > "$BACKUP_DIR/last_backup.txt"
echo "$DATE" > "$BACKUP_DIR/last_deploy_date.txt"

# Step 3: Pull latest code
echo -e "${YELLOW}[3/6] Pulling latest code...${NC}"
git pull origin main --force

NEW_COMMIT=$(git rev-parse --short HEAD)
echo -e "${GREEN}      Updated to commit: $NEW_COMMIT${NC}"

# Step 4: Install dependencies
echo -e "${YELLOW}[4/6] Installing dependencies...${NC}"
npm ci

# Step 5: Build application
echo -e "${YELLOW}[5/6] Building application...${NC}"
NODE_OPTIONS='--max-old-space-size=1536' npm run build

# Step 6: Restart application (migrations run on startup)
echo -e "${YELLOW}[6/6] Restarting application...${NC}"
pm2 reload ecosystem.config.cjs --update-env

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${GREEN}  Previous commit: $CURRENT_COMMIT${NC}"
echo -e "${GREEN}  Current commit:  $NEW_COMMIT${NC}"
echo -e "${GREEN}  Backup file:     $BACKUP_FILE${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}To rollback if needed, run: ./restore.sh${NC}"

# Cleanup old backups (keep last 5)
echo -e "${YELLOW}Cleaning up old backups (keeping last 5)...${NC}"
ls -t $BACKUP_DIR/backup_*.dump 2>/dev/null | tail -n +6 | xargs -r rm --
echo -e "${GREEN}Done!${NC}"
