#!/bin/bash

# Installation script for git hooks
# Run this once to set up automatic migration generation

echo "🔧 Installing git pre-commit hook..."

# Create the .git/hooks directory if it doesn't exist
mkdir -p .git/hooks

# Copy the pre-commit hook
cp scripts/pre-commit-hook.sh .git/hooks/pre-commit

# Make it executable
chmod +x .git/hooks/pre-commit

echo "✅ Git hook installed successfully!"
echo ""
echo "Now whenever you commit changes to shared/schema.ts,"
echo "migration files will be automatically generated and added to your commit."
echo ""
echo "To test it, try:"
echo "  1. Make a change to shared/schema.ts"
echo "  2. git add shared/schema.ts"
echo "  3. git commit -m 'test'"
echo "  4. Watch the magic happen! ✨"
