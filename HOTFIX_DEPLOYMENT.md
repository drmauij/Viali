# Emergency Hotfix: locations → units Migration

## Problem
Your production database has a `locations` table but your code expects a `units` table, causing the app to crash with "relation 'units' does not exist" errors.

## Solution
Apply a manual SQL hotfix to rename `locations` to `units` and update all foreign key references.

---

## Step 1: Apply Hotfix SQL to Production Database

### Via Aiven Console (Recommended)

1. **Log into Aiven Console**: https://console.aiven.io
2. **Navigate to your Viali PostgreSQL database**
3. **Open the Query Editor** (or SQL tab)
4. **Copy and paste** the entire contents of `migrations/0001_hotfix_locations_to_units.sql`
5. **Execute the SQL**
6. **Verify success**: You should see "ALTER TABLE" messages without errors

### Via Command Line (Alternative)

If you have `psql` installed on your server:

```bash
# On your Exoscale server
psql "$DATABASE_URL" -f ~/viali/migrations/0001_hotfix_locations_to_units.sql
```

---

## Step 2: Update Code on Server

### From Replit:
```bash
# In Replit terminal - push changes to GitHub
git add .
git commit -m "Add hotfix migration: rename locations to units"
git push origin main
```

### On Exoscale Server:
```bash
# SSH into your server
cd ~/viali

# Pull latest code
git pull origin main

# Rebuild the app
npm run build

# Restart PM2 processes
pm2 restart all

# Check logs
pm2 logs viali-app --lines 50
```

---

## Step 3: Verify the Fix

After restarting, you should see:

✅ **No more "relation 'units' does not exist" errors**
✅ **Migration log shows**: `✓ Database schema already tracked` (because we manually applied it)
✅ **App starts successfully** on port 5000
✅ **Login works** (getUserHospitals can now query the units table)

Check with:
```bash
# Watch live logs
pm2 logs viali-app

# Test the login endpoint
curl http://localhost:5000/api/auth/user
```

---

## What This Hotfix Does

1. **Renames table**: `locations` → `units`
2. **Ensures columns exist**:
   - `type` (varchar)
   - `parent_id` (varchar)
   - `created_at` (timestamp)
3. **Renames all foreign key columns**: `location_id` → `unit_id` in:
   - user_hospital_roles
   - folders
   - items
   - lots
   - stock_levels
   - activities
   - controlled_checks
   - import_jobs
   - checklist_templates
   - checklist_completions
4. **Renames hospital references**: `anesthesia_location_id` → `anesthesia_unit_id`, etc.
5. **Recreates indexes** with correct names

---

## Important Notes

- ✅ **Data preservation**: This migration does NOT delete any data - it only renames tables and columns
- ✅ **Idempotent**: The SQL uses `IF EXISTS` and `IF NOT EXISTS` checks, so it's safe to run multiple times
- ⚠️ **Missing tables**: This only fixes the locations→units mismatch. Other missing tables (anesthesia_events, patients, cases, etc.) will need separate migrations
- 📝 **Migration tracking**: The drizzle journal has been updated so the system knows this migration was applied

---

## Troubleshooting

### If you still see errors about missing tables

Some tables from your schema aren't in the original migration (anesthesia_events, patients, cases, etc.). These will need to be added in a future migration. For now, the app should work for basic functionality.

### If migrations don't run automatically

The migration was applied manually to production, so drizzle won't try to run it again. This is expected behavior.

### If you need to verify what tables exist

Via Aiven Console:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

---

## Next Steps

Once the hotfix is deployed and working:

1. ✅ Verify core functionality (login, inventory, etc.)
2. 🔄 Plan migrations for the missing anesthesia module tables
3. 📊 Test all features to identify any other schema mismatches
4. 🚀 Consider using drizzle-kit push for development and proper migrations for production going forward
