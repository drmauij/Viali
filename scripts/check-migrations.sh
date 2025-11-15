#!/bin/bash

# Helper script to check if migrations need to be generated
# Run this after making changes to shared/schema.ts

echo "🔍 Checking migration status..."
echo ""

# Check if there are uncommitted changes to schema.ts
if git diff --name-only | grep -q "shared/schema.ts"; then
    echo "⚠️  WARNING: Uncommitted changes detected in shared/schema.ts"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Run: npm run db:generate"
    echo "   2. Review the generated migration file in migrations/"
    echo "   3. Commit both schema.ts AND the new migration file"
    echo ""
elif git diff --cached --name-only | grep -q "shared/schema.ts"; then
    echo "⚠️  WARNING: Staged changes detected in shared/schema.ts"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Run: npm run db:generate"
    echo "   2. Review the generated migration file in migrations/"
    echo "   3. Add the migration file to your commit: git add migrations/"
    echo ""
else
    echo "✅ No uncommitted schema changes detected"
    echo ""
    
    # Check if there are untracked migration files
    UNTRACKED=$(git ls-files --others --exclude-standard migrations/*.sql 2>/dev/null)
    if [ -n "$UNTRACKED" ]; then
        echo "⚠️  Found untracked migration files!"
        echo "   Don't forget to: git add migrations/"
        echo ""
    fi
fi

echo "📋 Deployment checklist for Exoscale:"
echo "   ✓ Schema changes in shared/schema.ts"
echo "   ✓ Migration files generated (npm run db:generate)"
echo "   ✓ All files committed to git"
echo "   ✓ Pushed to GitHub"
echo "   ✓ On server: git pull && pm2 restart all"
echo ""
echo "💡 Migrations run automatically on app restart"
echo ""
