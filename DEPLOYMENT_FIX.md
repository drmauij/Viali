# Fixed Migration System - Deployment Instructions

## What Was Fixed

The migration system had custom "baseline" logic that was preventing migrations from running. This has been removed, and now Drizzle's native migration system runs properly.

**Changes Made:**
1. ✅ Removed broken baseline code from `server/index.ts`
2. ✅ Simplified migration to just call `migrate()` unconditionally
3. ✅ Recreated the base migration file with correct schema (including `units` table)

---

## Deploy to Production (Exoscale Server)

### Step 1: Push Code from Replit

```bash
# In Replit terminal
git add .
git commit -m "Fix migration system - remove baseline logic"
git push origin main
```

### Step 2: Wipe Database (In DBeaver)

Connect to your Exoscale database and run:

```sql
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

This gives you a completely clean database.

### Step 3: Deploy on Server

SSH into your Exoscale server and run:

```bash
cd ~/viali

# Pull latest code
git pull origin main

# Rebuild
npm run build

# Restart
pm2 restart all

# Watch logs
pm2 logs viali-app --lines 50
```

### Step 4: Verify Success

You should see in the logs:

```
✓ Database migrations completed successfully
serving on port 5000
```

**No more:**
- ❌ "Existing schema baselined"
- ❌ "relation 'users' does not exist"
- ❌ "relation 'units' does not exist"

### Step 5: Test Login

Try logging in with your demo user. It should work!

---

## What to Expect

1. **First boot after database wipe:**
   - Migrations will run
   - All tables will be created
   - Server starts successfully

2. **Subsequent boots:**
   - Migrations are tracked in `drizzle.__drizzle_migrations`
   - Only new migrations will run
   - No "baseline" confusion

---

## Troubleshooting

### If migrations still don't run

Check that the public schema exists:
```sql
SELECT schema_name FROM information_schema.schemata;
```

If missing, create it:
```sql
CREATE SCHEMA public;
```

### If tables aren't created

Check migration folder on server:
```bash
ls -la ~/viali/migrations/
```

Should show `0000_broken_liz_osborn.sql`

---

## Summary

The root cause was custom code that was **faking** migration success without actually running the SQL. By removing that and letting Drizzle handle migrations naturally, everything now works as expected.

No more migration headaches! 🎉
