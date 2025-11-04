#!/bin/bash

# Auto-generate database migrations when schema changes
# This hook runs before every commit

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if schema.ts is being committed
if git diff --cached --name-only | grep -q "shared/schema.ts"; then
    echo -e "${YELLOW}📊 Database schema change detected in shared/schema.ts${NC}"
    echo -e "${YELLOW}🔄 Auto-generating migration file...${NC}"
    
    # Generate migration
    npm run db:generate --silent
    
    # Check if any new migration files were created
    NEW_MIGRATIONS=$(git status --porcelain migrations/ | grep "^??" | awk '{print $2}')
    
    if [ -n "$NEW_MIGRATIONS" ]; then
        echo -e "${GREEN}✅ Migration file(s) generated:${NC}"
        echo "$NEW_MIGRATIONS" | while read -r file; do
            echo -e "   ${GREEN}→${NC} $file"
            # Add the new migration file to the commit
            git add "$file"
        done
        echo -e "${GREEN}✅ Migration file(s) added to commit${NC}"
    else
        echo -e "${YELLOW}⚠️  No new migrations generated (schema may be in sync)${NC}"
    fi
    
    echo ""
fi

# Continue with the commit
exit 0
