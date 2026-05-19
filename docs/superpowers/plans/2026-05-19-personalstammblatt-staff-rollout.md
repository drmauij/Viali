# Personalstammblatt staff rollout — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing external-worker Personalstammblatt form (`/worklog/:token`) to cover all staff (internal + external) on clinics that opt in via a new per-hospital toggle.

**Architecture:** Reuse `external_worklog_links` for both populations by adding `user_id`, `personal_data_only`, send-tracking columns, and `submitted_at`. Extract the 5 personal-data tabs from `ExternalWorklog.tsx` into a shared `<StammblattForm>` component used by the token portal and a new in-app `/profile/stammblatt` page. Gate every new UI/route behind `hospitals.addon_personalstammblatt` (default `false`).

**Tech Stack:** Drizzle ORM + Postgres, Vitest + supertest for backend tests, React + Tailwind + shadcn/ui on the client, Resend for email (existing helper).

**Spec:** `docs/superpowers/specs/2026-05-19-personalstammblatt-staff-rollout-design.md`

---

## File map

**Create:**
- `migrations/0265_personalstammblatt_addon.sql` — schema migration
- `server/services/stammblatt.ts` — `ensureStammblattLink`, `rotateStammblattToken`, `markSubmittedIfComplete`, `isValidStaffEmail`
- `server/routes/me-stammblatt.ts` — self-fill endpoints
- `client/src/components/stammblatt/StammblattForm.tsx` — shared form (5 tabs)
- `client/src/components/stammblatt/StammblattStatusBadge.tsx` — status pill used in HR list
- `client/src/components/StammblattBanner.tsx` — app-shell banner
- `client/src/pages/profile/Stammblatt.tsx` — in-app self-fill page
- `tests/stammblatt-service.test.ts` — unit tests for the service module
- `tests/stammblatt-hr-routes.test.ts` — integration tests for HR invite endpoints
- `tests/stammblatt-me-routes.test.ts` — integration tests for self-fill endpoints
- `tests/stammblatt-token-expiry.test.ts` — token expiry behavior on `/worklog/:token`
- `tests/stammblatt-staff-list-status.test.ts` — staff list status attachment

**Modify:**
- `shared/schema.ts` — add new columns + index + nullable change
- `migrations/meta/_journal.json` — journal entry for the new migration
- `server/email.ts` — add `sendStammblattInviteEmail`
- `server/routes/worklog.ts` — token expiry check on `GET`/`PATCH`/image endpoints
- `server/routes/business.ts` — extend `GET /api/business/:hospitalId/staff` aggregation; add invite + bulk endpoints
- `server/routes.ts` — mount the new `me-stammblatt` router
- `client/src/pages/ExternalWorklog.tsx` — use `<StammblattForm>`; hide 2 tabs when `personal_data_only=true`
- `client/src/pages/business/SimplifiedStaff.tsx` — new column + buttons + filter + bulk action
- `client/src/pages/admin/Settings.tsx` — new toggle in Experimental tab
- `client/src/App.tsx` (or app-shell file) — mount `<StammblattBanner>` and the `/profile/stammblatt` route

---

## Task 1: Schema + migration

**Files:**
- Modify: `shared/schema.ts`
- Create: `migrations/0265_personalstammblatt_addon.sql`
- Modify: `migrations/meta/_journal.json`

- [ ] **Step 1.1: Add `addonPersonalstammblatt` to the `hospitals` table in `shared/schema.ts`**

Find the line near `addonPatientChat: boolean("addon_patient_chat").default(false), ...` and add directly below it:

```ts
addonPersonalstammblatt: boolean("addon_personalstammblatt").notNull().default(false), // Personalstammblatt for all staff (internal + external)
```

- [ ] **Step 1.2: Update the `externalWorklogLinks` table in `shared/schema.ts`**

Make `unitId` nullable by removing `.notNull()`:

```ts
unitId: varchar("unit_id").references(() => units.id, { onDelete: 'cascade' }),
```

Add the new columns just before `isActive`:

```ts
userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
personalDataOnly: boolean("personal_data_only").notNull().default(false),
inviteCount: integer("invite_count").notNull().default(0),
lastInvitedAt: timestamp("last_invited_at"),
tokenExpiresAt: timestamp("token_expires_at"),
submittedAt: timestamp("submitted_at"),
```

Add an index in the table options block at the bottom of the table definition (next to the existing `index(...)` entries):

```ts
index("idx_external_worklog_links_user_hospital").on(table.userId, table.hospitalId),
```

- [ ] **Step 1.3: Write the migration SQL file**

Create `migrations/0265_personalstammblatt_addon.sql`:

```sql
-- Personalstammblatt rollout: per-hospital addon flag + new columns on external_worklog_links

ALTER TABLE "hospitals" ADD COLUMN IF NOT EXISTS "addon_personalstammblatt" boolean NOT NULL DEFAULT false;

ALTER TABLE "external_worklog_links" ADD COLUMN IF NOT EXISTS "user_id" varchar;
ALTER TABLE "external_worklog_links" ADD COLUMN IF NOT EXISTS "personal_data_only" boolean NOT NULL DEFAULT false;
ALTER TABLE "external_worklog_links" ADD COLUMN IF NOT EXISTS "invite_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "external_worklog_links" ADD COLUMN IF NOT EXISTS "last_invited_at" timestamp;
ALTER TABLE "external_worklog_links" ADD COLUMN IF NOT EXISTS "token_expires_at" timestamp;
ALTER TABLE "external_worklog_links" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'external_worklog_links_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "external_worklog_links"
      ADD CONSTRAINT "external_worklog_links_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE "external_worklog_links" ALTER COLUMN "unit_id" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_external_worklog_links_user_hospital"
  ON "external_worklog_links" ("user_id", "hospital_id");
```

- [ ] **Step 1.4: Add the migration to the Drizzle journal**

Open `migrations/meta/_journal.json`. Find the entry with the highest `when` timestamp (sort all entries by `when`). Add a new entry at the end of the `entries` array with `idx` = (last idx + 1), `when` = current epoch ms (use `node -e "console.log(Date.now())"`), `tag` = `"0265_personalstammblatt_addon"`, `breakpoints` = `true`:

```json
{
  "idx": <last+1>,
  "version": "7",
  "when": <epoch_ms_higher_than_any_existing>,
  "tag": "0265_personalstammblatt_addon",
  "breakpoints": true
}
```

Verify the new entry's `when` is strictly greater than every existing entry's `when` (memory note: some legacy entries have manually rounded timestamps that may be out of order — use a value larger than the current `Date.now()`).

- [ ] **Step 1.5: Apply schema to the database**

Run: `npx drizzle-kit push`
Expected: "Changes applied" or "[✓] Pulled schema from database" — no pending diffs after a second run.

Run: `npm run check`
Expected: clean (no TS errors).

- [ ] **Step 1.6: Commit**

```bash
git add shared/schema.ts migrations/0265_personalstammblatt_addon.sql migrations/meta/_journal.json
git commit -m "$(cat <<'EOF'
feat(stammblatt): schema + migration for Personalstammblatt addon

Adds hospitals.addon_personalstammblatt + extends external_worklog_links
with user_id, personal_data_only, invite_count, last_invited_at,
token_expires_at, submitted_at. Makes unit_id nullable. Idempotent.
EOF
)"
```

---

## Task 2: `server/services/stammblatt.ts` helpers

**Files:**
- Create: `server/services/stammblatt.ts`
- Test: `tests/stammblatt-service.test.ts`

- [ ] **Step 2.1: Write failing tests**

Create `tests/stammblatt-service.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { hospitals, units, users, externalWorklogLinks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  ensureStammblattLink,
  rotateStammblattToken,
  markSubmittedIfComplete,
  isValidStaffEmail,
} from "../server/services/stammblatt";

const hospitalId = `test-hosp-${randomUUID()}`;
const userId = `test-user-${randomUUID()}`;

beforeAll(async () => {
  await db.insert(hospitals).values({
    id: hospitalId,
    name: "Test Hospital",
    addonPersonalstammblatt: true,
  } as any);
  await db.insert(users).values({
    id: userId,
    email: "alice@example.com",
    firstName: "Alice",
    lastName: "Doe",
  } as any);
});

afterAll(async () => {
  await db.delete(externalWorklogLinks).where(eq(externalWorklogLinks.hospitalId, hospitalId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe("isValidStaffEmail", () => {
  it("rejects empty, null, and @staff.local placeholders", () => {
    expect(isValidStaffEmail(null)).toBe(false);
    expect(isValidStaffEmail("")).toBe(false);
    expect(isValidStaffEmail("foo.bar.abc123@staff.local")).toBe(false);
    expect(isValidStaffEmail("not-an-email")).toBe(false);
  });
  it("accepts well-formed emails", () => {
    expect(isValidStaffEmail("alice@example.com")).toBe(true);
  });
});

describe("ensureStammblattLink", () => {
  it("creates a personal_data_only link with a 30-day expiry", async () => {
    const link = await ensureStammblattLink(userId, hospitalId);
    expect(link.userId).toBe(userId);
    expect(link.hospitalId).toBe(hospitalId);
    expect(link.personalDataOnly).toBe(true);
    expect(link.unitId).toBeNull();
    expect(link.token).toBeTruthy();
    const days = (link.tokenExpiresAt!.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it("returns the same link on subsequent calls (idempotent)", async () => {
    const first = await ensureStammblattLink(userId, hospitalId);
    const second = await ensureStammblattLink(userId, hospitalId);
    expect(second.id).toBe(first.id);
  });
});

describe("rotateStammblattToken", () => {
  it("issues a new token and refreshes the expiry", async () => {
    const link = await ensureStammblattLink(userId, hospitalId);
    const oldToken = link.token;
    const rotated = await rotateStammblattToken(link.id);
    expect(rotated.token).not.toBe(oldToken);
    expect(rotated.tokenExpiresAt!.getTime()).toBeGreaterThan(link.tokenExpiresAt!.getTime() - 1000);
  });
});

describe("markSubmittedIfComplete", () => {
  it("does not set submitted_at when required minimums are missing", async () => {
    const link = await ensureStammblattLink(userId, hospitalId);
    await db.update(externalWorklogLinks)
      .set({ firstName: "Alice", lastName: "Doe", submittedAt: null })
      .where(eq(externalWorklogLinks.id, link.id));
    const after = await markSubmittedIfComplete(link.id);
    expect(after.submittedAt).toBeNull();
  });

  it("sets submitted_at exactly once when all minimums are present", async () => {
    const link = await ensureStammblattLink(userId, hospitalId);
    await db.update(externalWorklogLinks)
      .set({
        firstName: "Alice", lastName: "Doe", dateOfBirth: "1990-01-01",
        address: "Main 1", city: "Zurich", zip: "8001",
        ahvNumber: "756.1234.5678.90", bankAccount: "CH00 1234",
        submittedAt: null,
      })
      .where(eq(externalWorklogLinks.id, link.id));
    const first = await markSubmittedIfComplete(link.id);
    expect(first.submittedAt).toBeInstanceOf(Date);
    const firstStamp = first.submittedAt;

    const second = await markSubmittedIfComplete(link.id);
    expect(second.submittedAt).toEqual(firstStamp); // does not reset
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npx vitest run tests/stammblatt-service.test.ts`
Expected: FAIL — `Cannot find module '../server/services/stammblatt'`.

- [ ] **Step 2.3: Implement the service**

Create `server/services/stammblatt.ts`:

```ts
import { db } from "../db";
import { externalWorklogLinks, users, type ExternalWorklogLink } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const TOKEN_VALIDITY_DAYS = 30;

const REQUIRED_FIELDS = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "address",
  "city",
  "zip",
  "ahvNumber",
  "bankAccount",
] as const satisfies readonly (keyof ExternalWorklogLink)[];

function expiryFromNow(): Date {
  return new Date(Date.now() + TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

export function isValidStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  if (email.toLowerCase().endsWith("@staff.local")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function ensureStammblattLink(
  userId: string,
  hospitalId: string,
): Promise<ExternalWorklogLink> {
  const existing = await db
    .select()
    .from(externalWorklogLinks)
    .where(and(
      eq(externalWorklogLinks.userId, userId),
      eq(externalWorklogLinks.hospitalId, hospitalId),
    ))
    .limit(1);
  if (existing.length > 0) return existing[0];

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error(`User ${userId} not found`);
  const email = user.email || `${userId}@staff.local`;

  const [created] = await db
    .insert(externalWorklogLinks)
    .values({
      userId,
      hospitalId,
      email,
      token: randomUUID(),
      personalDataOnly: true,
      tokenExpiresAt: expiryFromNow(),
      isActive: true,
    })
    .returning();
  return created;
}

export async function rotateStammblattToken(
  linkId: string,
): Promise<ExternalWorklogLink> {
  const [updated] = await db
    .update(externalWorklogLinks)
    .set({
      token: randomUUID(),
      tokenExpiresAt: expiryFromNow(),
      updatedAt: new Date(),
    })
    .where(eq(externalWorklogLinks.id, linkId))
    .returning();
  return updated;
}

export async function markSubmittedIfComplete(
  linkId: string,
): Promise<ExternalWorklogLink> {
  const [link] = await db
    .select()
    .from(externalWorklogLinks)
    .where(eq(externalWorklogLinks.id, linkId))
    .limit(1);
  if (!link) throw new Error(`Link ${linkId} not found`);
  if (link.submittedAt) return link;

  const allPresent = REQUIRED_FIELDS.every((f) => {
    const v = (link as any)[f];
    return v !== null && v !== undefined && v !== "";
  });
  if (!allPresent) return link;

  const [updated] = await db
    .update(externalWorklogLinks)
    .set({ submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(externalWorklogLinks.id, linkId))
    .returning();
  return updated;
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npx vitest run tests/stammblatt-service.test.ts`
Expected: all green.

- [ ] **Step 2.5: Commit**

```bash
git add server/services/stammblatt.ts tests/stammblatt-service.test.ts
git commit -m "$(cat <<'EOF'
feat(stammblatt): service helpers — ensureLink, rotateToken, markSubmittedIfComplete

Reusable helpers for creating personal-data-only links, rotating tokens
on resend (30-day expiry), and promoting a link to "submitted" once the
required minimums (name, DOB, address, AHV, bank account) are filled.
EOF
)"
```

---

## Task 3: Email template `sendStammblattInviteEmail`

**Files:**
- Modify: `server/email.ts`

- [ ] **Step 3.1: Add the new email function**

Append to `server/email.ts` directly below `sendWorklogLinkEmail`:

```ts
export async function sendStammblattInviteEmail(
  toEmail: string,
  token: string,
  hospitalName: string,
  language: 'de' | 'en' = 'de'
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableResendClient();

    const baseUrl = getAppBaseUrl();
    const link = `${baseUrl}/worklog/${token}`;

    const isGerman = language === 'de';
    const subject = isGerman
      ? `Bitte füllen Sie Ihr Personalstammblatt aus`
      : `Please complete your personnel data sheet`;
    const heading = isGerman ? 'Personalstammblatt' : 'Personnel Data Sheet';
    const body1 = isGerman
      ? `Bitte füllen Sie Ihre persönlichen Angaben für die Personalakte bei <strong>${hospitalName}</strong> aus.`
      : `Please complete your personal information for the personnel file at <strong>${hospitalName}</strong>.`;
    const body2 = isGerman
      ? 'Der Link ist 30 Tage gültig. Sie können das Formular jederzeit über denselben Link erneut öffnen.'
      : 'The link is valid for 30 days. You can re-open the same link to continue at any time.';
    const buttonText = isGerman ? 'Personalstammblatt ausfüllen' : 'Complete data sheet';
    const copyLink = isGerman ? 'Oder kopieren Sie diesen Link:' : 'Or copy this link:';
    const footer = isGerman
      ? 'Dies ist Ihr persönlicher Link - bitte teilen Sie ihn nicht mit anderen.'
      : 'This is your personal link - please do not share it with others.';

    await client.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${heading}</h2>
          <p style="color: #666;">${body1}</p>
          <p style="color: #666;">${body2}</p>
          ${getEmailButton(link, buttonText)}
          <p style="color: #999; font-size: 12px;">
            ${copyLink} <a href="${link}" style="color: #2563eb;">${link}</a>
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">${footer}</p>
        </div>
      `,
    });

    logger.info(`[Email] Successfully sent Stammblatt invite email to ${toEmail}`);
    return true;
  } catch (error) {
    logger.error('[Email] Failed to send Stammblatt invite email:', error);
    return false;
  }
}
```

- [ ] **Step 3.2: Verify it typechecks**

Run: `npm run check`
Expected: clean.

- [ ] **Step 3.3: Commit**

```bash
git add server/email.ts
git commit -m "feat(stammblatt): email template for invite/resend"
```

---

## Task 4: HR backend routes (invite + bulk) with addon gate

**Files:**
- Modify: `server/routes/business.ts`
- Test: `tests/stammblatt-hr-routes.test.ts`

- [ ] **Step 4.1: Write failing tests**

Create `tests/stammblatt-hr-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals, users, userHospitalRoles, externalWorklogLinks,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

vi.mock("../server/email", async () => {
  const actual: any = await vi.importActual("../server/email");
  return { ...actual, sendStammblattInviteEmail: vi.fn().mockResolvedValue(true) };
});

const adminId = `test-admin-${randomUUID()}`;
const staffId = `test-staff-${randomUUID()}`;
const hospitalId = `test-hosp-${randomUUID()}`;

let app: express.Express;

beforeAll(async () => {
  await db.insert(hospitals).values({
    id: hospitalId, name: "Test", addonPersonalstammblatt: true,
  } as any);
  await db.insert(users).values([
    { id: adminId, email: "admin@example.com", firstName: "A", lastName: "Admin" },
    { id: staffId, email: "staff@example.com", firstName: "S", lastName: "Staff" },
  ] as any);
  await db.insert(userHospitalRoles).values([
    { userId: adminId, hospitalId, role: "admin" },
    { userId: staffId, hospitalId, role: "surgeon" },
  ] as any);

  vi.doMock("../server/auth", () => ({
    isAuthenticated: (req: any, _res: any, next: any) => {
      req.user = { claims: { sub: adminId } };
      next();
    },
  }));
  const businessRouter = (await import("../server/routes/business")).default;
  app = express();
  app.use(express.json());
  app.use(businessRouter);
});

afterAll(async () => {
  await db.delete(externalWorklogLinks).where(eq(externalWorklogLinks.hospitalId, hospitalId));
  await db.delete(userHospitalRoles).where(eq(userHospitalRoles.hospitalId, hospitalId));
  await db.delete(users).where(eq(users.id, adminId));
  await db.delete(users).where(eq(users.id, staffId));
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe("POST /api/business/:hospitalId/staff/:userId/stammblatt-invite", () => {
  it("returns 403 when addon is off", async () => {
    await db.update(hospitals).set({ addonPersonalstammblatt: false }).where(eq(hospitals.id, hospitalId));
    const res = await request(app).post(`/api/business/${hospitalId}/staff/${staffId}/stammblatt-invite`);
    expect(res.status).toBe(403);
    await db.update(hospitals).set({ addonPersonalstammblatt: true }).where(eq(hospitals.id, hospitalId));
  });

  it("creates a link, sends email, increments counter on first call", async () => {
    const res = await request(app).post(`/api/business/${hospitalId}/staff/${staffId}/stammblatt-invite`);
    expect(res.status).toBe(200);
    expect(res.body.inviteCount).toBe(1);

    const [link] = await db.select().from(externalWorklogLinks)
      .where(eq(externalWorklogLinks.userId, staffId)).limit(1);
    expect(link.personalDataOnly).toBe(true);
    expect(link.lastInvitedAt).toBeInstanceOf(Date);
  });

  it("rotates the token and increments counter on resend", async () => {
    const [before] = await db.select().from(externalWorklogLinks)
      .where(eq(externalWorklogLinks.userId, staffId)).limit(1);
    const res = await request(app).post(`/api/business/${hospitalId}/staff/${staffId}/stammblatt-invite`);
    expect(res.status).toBe(200);
    expect(res.body.inviteCount).toBe(2);
    const [after] = await db.select().from(externalWorklogLinks)
      .where(eq(externalWorklogLinks.userId, staffId)).limit(1);
    expect(after.token).not.toBe(before.token);
  });

  it("skips users with invalid email in bulk endpoint", async () => {
    const placeholderId = `test-staff-placeholder-${randomUUID()}`;
    await db.insert(users).values({
      id: placeholderId, email: "foo.bar.abc123@staff.local", firstName: "P", lastName: "L",
    } as any);
    await db.insert(userHospitalRoles).values({
      userId: placeholderId, hospitalId, role: "surgeon",
    } as any);
    const res = await request(app).post(`/api/business/${hospitalId}/staff/stammblatt-invite/bulk`)
      .send({ scope: "all_incomplete" });
    expect(res.status).toBe(200);
    expect(res.body.skipped.find((s: any) => s.userId === placeholderId)).toBeTruthy();
    await db.delete(userHospitalRoles).where(eq(userHospitalRoles.userId, placeholderId));
    await db.delete(users).where(eq(users.id, placeholderId));
  });
});
```

- [ ] **Step 4.2: Run to verify failure**

Run: `npx vitest run tests/stammblatt-hr-routes.test.ts`
Expected: FAIL (routes return 404 — not implemented).

- [ ] **Step 4.3: Add the addon-gate helper at the top of `server/routes/business.ts`**

After the existing `isBusinessManager` middleware, add:

```ts
// Middleware: gate routes behind the per-hospital Personalstammblatt addon flag.
async function requirePersonalstammblattAddon(req: any, res: any, next: any) {
  try {
    const hospitalId = req.params.hospitalId;
    if (!hospitalId) return res.status(400).json({ message: "hospitalId required" });
    const [hosp] = await db.select({ flag: hospitals.addonPersonalstammblatt })
      .from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
    if (!hosp || !hosp.flag) return res.status(403).json({ message: "Addon disabled" });
    next();
  } catch (e) {
    logger.error("addon gate error", e);
    res.status(500).json({ message: "Addon check failed" });
  }
}
```

Make sure `hospitals` and `eq` are imported at the top of the file (they may already be).

- [ ] **Step 4.4: Add the single-invite route**

In `server/routes/business.ts`, add after the existing staff routes (after the PATCH update-staff route around line 449):

```ts
router.post(
  '/api/business/:hospitalId/staff/:userId/stammblatt-invite',
  isAuthenticated,
  isBusinessManager,
  requirePersonalstammblattAddon,
  async (req, res) => {
    try {
      const { hospitalId, userId } = req.params;
      const { ensureStammblattLink, rotateStammblattToken, isValidStaffEmail } =
        await import("../services/stammblatt");

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (!isValidStaffEmail(user.email)) {
        return res.status(400).json({ message: "User has no valid email" });
      }

      let link = await ensureStammblattLink(userId, hospitalId);
      // Always rotate token on send/resend
      link = await rotateStammblattToken(link.id);

      const [hosp] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
      const { sendStammblattInviteEmail } = await import("../email");
      await sendStammblattInviteEmail(
        user.email!,
        link.token,
        hosp?.name ?? "",
        (hosp?.defaultLanguage as 'de' | 'en') ?? 'de',
      );

      const [updated] = await db.update(externalWorklogLinks)
        .set({
          inviteCount: link.inviteCount + 1,
          lastInvitedAt: new Date(),
          email: user.email!, // keep email in sync with user
          updatedAt: new Date(),
        })
        .where(eq(externalWorklogLinks.id, link.id))
        .returning();

      res.json({
        inviteCount: updated.inviteCount,
        lastInvitedAt: updated.lastInvitedAt,
        tokenExpiresAt: updated.tokenExpiresAt,
      });
    } catch (e) {
      logger.error("Stammblatt invite failed", e);
      res.status(500).json({ message: "Failed to send invite" });
    }
  }
);
```

Imports needed at top of file (if not already present): `externalWorklogLinks` from `@shared/schema`.

- [ ] **Step 4.5: Add the bulk route**

Directly below the single-invite route:

```ts
router.post(
  '/api/business/:hospitalId/staff/stammblatt-invite/bulk',
  isAuthenticated,
  isBusinessManager,
  requirePersonalstammblattAddon,
  async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { userIds, scope } = req.body as { userIds?: string[]; scope?: 'all_incomplete' };
      const { isValidStaffEmail } = await import("../services/stammblatt");

      // Resolve target user ids
      let targetIds: string[] = [];
      if (Array.isArray(userIds) && userIds.length > 0) {
        targetIds = userIds;
      } else if (scope === 'all_incomplete') {
        const rows = await storage.getHospitalUsers(hospitalId);
        const userIdsSet = new Set<string>();
        for (const u of rows) {
          if (u.role === 'admin') continue;
          userIdsSet.add(u.user.id);
        }
        // Exclude users whose stammblatt is already submitted
        if (userIdsSet.size > 0) {
          const links = await db.select().from(externalWorklogLinks)
            .where(and(
              eq(externalWorklogLinks.hospitalId, hospitalId),
              inArray(externalWorklogLinks.userId, Array.from(userIdsSet)),
            ));
          for (const l of links) {
            if (l.userId && l.submittedAt) userIdsSet.delete(l.userId);
          }
        }
        targetIds = Array.from(userIdsSet);
      } else {
        return res.status(400).json({ message: "userIds or scope required" });
      }

      const skipped: Array<{ userId: string; reason: string }> = [];
      let sent = 0;

      const { ensureStammblattLink, rotateStammblattToken } =
        await import("../services/stammblatt");
      const { sendStammblattInviteEmail } = await import("../email");
      const [hosp] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);

      for (const uid of targetIds) {
        const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
        if (!u) { skipped.push({ userId: uid, reason: "not_found" }); continue; }
        if (!isValidStaffEmail(u.email)) { skipped.push({ userId: uid, reason: "no_valid_email" }); continue; }

        try {
          let link = await ensureStammblattLink(uid, hospitalId);
          link = await rotateStammblattToken(link.id);
          await sendStammblattInviteEmail(
            u.email!, link.token, hosp?.name ?? "",
            (hosp?.defaultLanguage as 'de' | 'en') ?? 'de',
          );
          await db.update(externalWorklogLinks).set({
            inviteCount: link.inviteCount + 1,
            lastInvitedAt: new Date(),
            email: u.email!,
            updatedAt: new Date(),
          }).where(eq(externalWorklogLinks.id, link.id));
          sent++;
        } catch (err) {
          logger.error(`Bulk stammblatt invite failed for ${uid}`, err);
          skipped.push({ userId: uid, reason: "send_failed" });
        }
      }

      res.json({ sent, skipped });
    } catch (e) {
      logger.error("Bulk Stammblatt invite failed", e);
      res.status(500).json({ message: "Bulk invite failed" });
    }
  }
);
```

Imports needed: `and`, `inArray` from `drizzle-orm` (verify already present).

- [ ] **Step 4.6: Run tests to verify pass**

Run: `npx vitest run tests/stammblatt-hr-routes.test.ts`
Expected: all green.

- [ ] **Step 4.7: Commit**

```bash
git add server/routes/business.ts tests/stammblatt-hr-routes.test.ts
git commit -m "$(cat <<'EOF'
feat(stammblatt): HR invite + bulk endpoints behind addon gate

POST /api/business/:hospitalId/staff/:userId/stammblatt-invite — creates
or resends a personal-data-only link, rotates token, increments counter,
emails the link. Bulk variant takes userIds[] or scope=all_incomplete.
403 when addon_personalstammblatt is off.
EOF
)"
```

---

## Task 5: Self-fill `/api/me/stammblatt` routes

**Files:**
- Create: `server/routes/me-stammblatt.ts`
- Modify: `server/routes.ts`
- Test: `tests/stammblatt-me-routes.test.ts`

- [ ] **Step 5.1: Write failing tests**

Create `tests/stammblatt-me-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, externalWorklogLinks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const userId = `test-me-${randomUUID()}`;
const hospitalId = `test-hosp-me-${randomUUID()}`;
let app: express.Express;

beforeAll(async () => {
  await db.insert(hospitals).values({
    id: hospitalId, name: "MeHosp", addonPersonalstammblatt: true,
  } as any);
  await db.insert(users).values({
    id: userId, email: "me@example.com", firstName: "Me", lastName: "Self",
  } as any);
  await db.insert(userHospitalRoles).values({
    userId, hospitalId, role: "surgeon",
  } as any);

  vi.doMock("../server/auth", () => ({
    isAuthenticated: (req: any, _res: any, next: any) => {
      req.user = { claims: { sub: userId } };
      req.session = { activeHospitalId: hospitalId };
      next();
    },
  }));

  const meRouter = (await import("../server/routes/me-stammblatt")).default;
  app = express();
  app.use(express.json());
  app.use(meRouter);
});

afterAll(async () => {
  await db.delete(externalWorklogLinks).where(eq(externalWorklogLinks.hospitalId, hospitalId));
  await db.delete(userHospitalRoles).where(eq(userHospitalRoles.hospitalId, hospitalId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe("GET /api/me/stammblatt", () => {
  it("403 when addon is off", async () => {
    await db.update(hospitals).set({ addonPersonalstammblatt: false }).where(eq(hospitals.id, hospitalId));
    const res = await request(app).get("/api/me/stammblatt");
    expect(res.status).toBe(403);
    await db.update(hospitals).set({ addonPersonalstammblatt: true }).where(eq(hospitals.id, hospitalId));
  });

  it("creates a link on first call and returns it", async () => {
    const res = await request(app).get("/api/me/stammblatt");
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
    expect(res.body.personalDataOnly).toBe(true);
    expect(res.body.submittedAt).toBeNull();
  });
});

describe("PATCH /api/me/stammblatt", () => {
  it("saves fields and sets submitted_at when required minimums met", async () => {
    const res = await request(app).patch("/api/me/stammblatt").send({
      firstName: "Me", lastName: "Self", dateOfBirth: "1980-01-01",
      address: "Bahnhofstr 1", city: "Zurich", zip: "8001",
      ahvNumber: "756.1111.1111.11", bankAccount: "CH00 9999",
    });
    expect(res.status).toBe(200);
    expect(res.body.submittedAt).toBeTruthy();
  });
});
```

- [ ] **Step 5.2: Run to verify failure**

Run: `npx vitest run tests/stammblatt-me-routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement the router**

Create `server/routes/me-stammblatt.ts`:

```ts
import { Router } from "express";
import { db } from "../db";
import { hospitals, externalWorklogLinks, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import { logger } from "../logger";
import {
  ensureStammblattLink, markSubmittedIfComplete,
} from "../services/stammblatt";

const router = Router();

async function getActiveHospitalId(req: any): Promise<string | null> {
  if (req.session?.activeHospitalId) return req.session.activeHospitalId;
  return null;
}

async function isAddonEnabled(hospitalId: string): Promise<boolean> {
  const [h] = await db.select({ flag: hospitals.addonPersonalstammblatt })
    .from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
  return !!h?.flag;
}

router.get('/api/me/stammblatt', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const hospitalId = await getActiveHospitalId(req);
    if (!hospitalId) return res.status(400).json({ message: "No active hospital" });
    if (!(await isAddonEnabled(hospitalId))) return res.status(403).json({ message: "Addon disabled" });

    const link = await ensureStammblattLink(userId, hospitalId);
    res.json(link);
  } catch (e) {
    logger.error("GET /api/me/stammblatt failed", e);
    res.status(500).json({ message: "Failed to load Stammblatt" });
  }
});

router.patch('/api/me/stammblatt', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const hospitalId = await getActiveHospitalId(req);
    if (!hospitalId) return res.status(400).json({ message: "No active hospital" });
    if (!(await isAddonEnabled(hospitalId))) return res.status(403).json({ message: "Addon disabled" });

    const link = await ensureStammblattLink(userId, hospitalId);

    const allowed = [
      "firstName","lastName","profession","address","city","zip","dateOfBirth",
      "maritalStatus","nationality","religion","mobile","ahvNumber",
      "hasChildBenefits","numberOfChildren","childBenefitsRecipient","childBenefitsRegistration",
      "hasResidencePermit","residencePermitType","residencePermitValidUntil",
      "residencePermitFrontImage","residencePermitBackImage",
      "bankName","bankAddress","bankAccount","hasOwnVehicle",
    ];
    const patch: any = {};
    for (const k of allowed) {
      if (k in req.body) patch[k] = req.body[k] === "" ? null : req.body[k];
    }
    patch.updatedAt = new Date();

    await db.update(externalWorklogLinks)
      .set(patch).where(eq(externalWorklogLinks.id, link.id));

    const final = await markSubmittedIfComplete(link.id);
    res.json(final);
  } catch (e) {
    logger.error("PATCH /api/me/stammblatt failed", e);
    res.status(500).json({ message: "Failed to save Stammblatt" });
  }
});

export default router;
```

- [ ] **Step 5.4: Mount the router**

Edit `server/routes.ts`. Find the spot where other routers are mounted (e.g. `app.use(worklogRouter)`). Add:

```ts
const meStammblattRouter = (await import("./routes/me-stammblatt")).default;
app.use(meStammblattRouter);
```

- [ ] **Step 5.5: Run tests**

Run: `npx vitest run tests/stammblatt-me-routes.test.ts`
Expected: all green.

- [ ] **Step 5.6: Commit**

```bash
git add server/routes/me-stammblatt.ts server/routes.ts tests/stammblatt-me-routes.test.ts
git commit -m "$(cat <<'EOF'
feat(stammblatt): self-fill endpoints (/api/me/stammblatt)

In-app users on opted-in clinics can fetch/save their Personalstammblatt
without an email token (session auth). Same write surface and required-
minimum logic as the public token endpoint.
EOF
)"
```

---

## Task 6: Token expiry check on public endpoints

**Files:**
- Modify: `server/routes/worklog.ts`
- Test: `tests/stammblatt-token-expiry.test.ts`

- [ ] **Step 6.1: Write failing test**

Create `tests/stammblatt-token-expiry.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import { hospitals, units, users, externalWorklogLinks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const hospitalId = `test-hosp-exp-${randomUUID()}`;
const unitId = `test-unit-exp-${randomUUID()}`;
const userId = `test-u-exp-${randomUUID()}`;
let expiredToken = randomUUID();
let validToken = randomUUID();
let app: express.Express;

beforeAll(async () => {
  await db.insert(hospitals).values({ id: hospitalId, name: "Exp" } as any);
  await db.insert(units).values({ id: unitId, hospitalId, name: "Unit", type: "OR" } as any);
  await db.insert(users).values({ id: userId, email: "exp@example.com" } as any);
  await db.insert(externalWorklogLinks).values([
    {
      id: randomUUID(), userId, hospitalId, unitId, email: "exp@example.com",
      token: expiredToken, isActive: true, personalDataOnly: true,
      tokenExpiresAt: new Date(Date.now() - 1000),
    },
    {
      id: randomUUID(), userId, hospitalId, unitId, email: "exp2@example.com",
      token: validToken, isActive: true, personalDataOnly: true,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60),
    },
  ] as any);

  vi.doMock("../server/auth", () => ({
    isAuthenticated: (_req: any, _res: any, next: any) => next(),
  }));
  const worklogRouter = (await import("../server/routes/worklog")).default;
  app = express();
  app.use(express.json());
  app.use(worklogRouter);
});

afterAll(async () => {
  await db.delete(externalWorklogLinks).where(eq(externalWorklogLinks.hospitalId, hospitalId));
  await db.delete(units).where(eq(units.hospitalId, hospitalId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe("token expiry", () => {
  it("GET /api/worklog/:token returns 410 for expired tokens", async () => {
    const res = await request(app).get(`/api/worklog/${expiredToken}`);
    expect(res.status).toBe(410);
  });
  it("GET /api/worklog/:token still works for unexpired tokens", async () => {
    const res = await request(app).get(`/api/worklog/${validToken}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 6.2: Run to verify failure**

Run: `npx vitest run tests/stammblatt-token-expiry.test.ts`
Expected: FAIL — expired token returns 200 instead of 410.

- [ ] **Step 6.3: Add expiry check helper**

At the top of `server/routes/worklog.ts` (after imports), add:

```ts
function isExpired(link: { tokenExpiresAt?: Date | null }): boolean {
  return !!link.tokenExpiresAt && link.tokenExpiresAt.getTime() < Date.now();
}
```

- [ ] **Step 6.4: Apply the check in `GET /api/worklog/:token`**

Find the `if (!link.isActive)` block (around line 31) and add immediately after:

```ts
if (isExpired(link)) {
  return res.status(410).json({ message: "This link has expired" });
}
```

- [ ] **Step 6.5: Apply the same check in `PATCH /api/worklog/:token/personal-data`, `POST /permit-image-upload`, `GET /permit-image/:side`, and `POST /entries`**

For each handler, replace the existing `if (!link || !link.isActive)` block with:

```ts
if (!link || !link.isActive) {
  return res.status(404).json({ message: "Invalid or expired link" });
}
if (isExpired(link)) {
  return res.status(410).json({ message: "This link has expired" });
}
```

- [ ] **Step 6.6: Run tests**

Run: `npx vitest run tests/stammblatt-token-expiry.test.ts`
Expected: all green.

- [ ] **Step 6.7: Commit**

```bash
git add server/routes/worklog.ts tests/stammblatt-token-expiry.test.ts
git commit -m "feat(stammblatt): enforce token_expires_at on public /worklog endpoints"
```

---

## Task 7: Staff list endpoint — attach Stammblatt status

**Files:**
- Modify: `server/routes/business.ts`
- Test: `tests/stammblatt-staff-list-status.test.ts`

- [ ] **Step 7.1: Write failing test**

Create `tests/stammblatt-staff-list-status.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, externalWorklogLinks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const adminId = `t-st-admin-${randomUUID()}`;
const missingId = `t-st-miss-${randomUUID()}`;
const invitedId = `t-st-inv-${randomUUID()}`;
const submittedId = `t-st-sub-${randomUUID()}`;
const hospitalId = `t-st-hosp-${randomUUID()}`;
let app: express.Express;

beforeAll(async () => {
  await db.insert(hospitals).values({
    id: hospitalId, name: "T", addonPersonalstammblatt: true,
  } as any);
  await db.insert(users).values([
    { id: adminId, email: "a@x.com" },
    { id: missingId, email: "m@x.com", firstName: "Miss", lastName: "Ing" },
    { id: invitedId, email: "i@x.com", firstName: "Inv", lastName: "Ited" },
    { id: submittedId, email: "s@x.com", firstName: "Sub", lastName: "Mit" },
  ] as any);
  await db.insert(userHospitalRoles).values([
    { userId: adminId, hospitalId, role: "admin" },
    { userId: missingId, hospitalId, role: "surgeon" },
    { userId: invitedId, hospitalId, role: "surgeon" },
    { userId: submittedId, hospitalId, role: "surgeon" },
  ] as any);
  await db.insert(externalWorklogLinks).values([
    {
      id: randomUUID(), userId: invitedId, hospitalId, email: "i@x.com",
      token: randomUUID(), personalDataOnly: true, isActive: true,
      inviteCount: 1, lastInvitedAt: new Date(),
    },
    {
      id: randomUUID(), userId: submittedId, hospitalId, email: "s@x.com",
      token: randomUUID(), personalDataOnly: true, isActive: true,
      inviteCount: 1, submittedAt: new Date(),
    },
  ] as any);

  vi.doMock("../server/auth", () => ({
    isAuthenticated: (req: any, _res: any, next: any) => {
      req.user = { claims: { sub: adminId } };
      next();
    },
  }));
  const businessRouter = (await import("../server/routes/business")).default;
  app = express();
  app.use(express.json());
  app.use(businessRouter);
});

afterAll(async () => {
  await db.delete(externalWorklogLinks).where(eq(externalWorklogLinks.hospitalId, hospitalId));
  await db.delete(userHospitalRoles).where(eq(userHospitalRoles.hospitalId, hospitalId));
  for (const id of [adminId, missingId, invitedId, submittedId]) {
    await db.delete(users).where(eq(users.id, id));
  }
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe("GET /api/business/:hospitalId/staff stammblatt status", () => {
  it("returns missing/invited/submitted per user", async () => {
    const res = await request(app).get(`/api/business/${hospitalId}/staff`);
    expect(res.status).toBe(200);
    const byId: Record<string, any> = Object.fromEntries(res.body.map((r: any) => [r.id, r]));
    expect(byId[missingId].stammblatt.status).toBe("missing");
    expect(byId[invitedId].stammblatt.status).toBe("invited");
    expect(byId[invitedId].stammblatt.inviteCount).toBe(1);
    expect(byId[submittedId].stammblatt.status).toBe("submitted");
  });
});
```

- [ ] **Step 7.2: Run to verify failure**

Run: `npx vitest run tests/stammblatt-staff-list-status.test.ts`
Expected: FAIL — no `stammblatt` key.

- [ ] **Step 7.3: Extend the aggregation in `GET /api/business/:hospitalId/staff`**

Open `server/routes/business.ts`, find the staff aggregation (around line 167). Add the `stammblatt` field to the userMap type and initialize it to `{ status: 'missing', inviteCount: 0 }` when a new entry is created.

After the existing batched `links` query (around line 240), add a second pass that matches by `userId` and overrides the status:

```ts
const linksByUserId = new Map(
  links.filter((l) => l.userId).map((l) => [l.userId as string, l]),
);

function deriveStatus(link: any): 'invited' | 'in_progress' | 'submitted' {
  if (link.submittedAt) return 'submitted';
  if (link.lastAccessedAt) return 'in_progress';
  return 'invited';
}

for (const u of userMap.values()) {
  const link = linksByUserId.get(u.id);
  if (link) {
    u.stammblatt = {
      status: deriveStatus(link),
      inviteCount: link.inviteCount ?? 0,
      lastInvitedAt: link.lastInvitedAt,
      tokenExpiresAt: link.tokenExpiresAt,
      submittedAt: link.submittedAt,
    };
  }
}
```

Initialize `stammblatt: { status: 'missing', inviteCount: 0 }` in the `userMap.set(...)` block earlier in the same handler.

- [ ] **Step 7.4: Run tests**

Run: `npx vitest run tests/stammblatt-staff-list-status.test.ts`
Expected: all green.

- [ ] **Step 7.5: Commit**

```bash
git add server/routes/business.ts tests/stammblatt-staff-list-status.test.ts
git commit -m "feat(stammblatt): attach status (missing/invited/in_progress/submitted) to staff list"
```

---

## Task 8: Extract `<StammblattForm>` shared component

**Files:**
- Create: `client/src/components/stammblatt/StammblattForm.tsx`
- Modify: `client/src/pages/ExternalWorklog.tsx`

- [ ] **Step 8.1: Identify the 5 personal-data tabs in `ExternalWorklog.tsx`**

Open the file and locate the Tabs containing **Personalien**, **Kinder**, **Aufenthalt**, **Bank**, **Mobilität**. Note the local state shape (likely `personalData: { firstName, lastName, ... }`) and the save function (PATCH to `/api/worklog/:token/personal-data`).

- [ ] **Step 8.2: Create the shared component**

This is a **mechanical extraction** — no behavior change. Open `ExternalWorklog.tsx`, copy the JSX of the 5 personal-data tabs (Personalien / Kinder / Aufenthalt / Bank / Mobilität) verbatim into the new file, plus any helper functions / translation keys / validation those tabs use. The only modifications: (1) replace the inline `apiRequest('/api/worklog/:token/personal-data', ...)` calls with `props.onSave(data)`, and (2) replace the inline image upload call with `props.uploadPermitImage(side, file)`. Skeleton:

```tsx
import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// ... move all other imports the 5 tabs need

export type StammblattData = {
  firstName: string; lastName: string; profession: string;
  address: string; city: string; zip: string; dateOfBirth: string;
  maritalStatus: string; nationality: string; religion: string;
  mobile: string; ahvNumber: string;
  hasChildBenefits: boolean; numberOfChildren: number;
  childBenefitsRecipient: string; childBenefitsRegistration: string;
  hasResidencePermit: boolean; residencePermitType: string;
  residencePermitValidUntil: string;
  residencePermitFrontImage: string; residencePermitBackImage: string;
  bankName: string; bankAddress: string; bankAccount: string;
  hasOwnVehicle: boolean;
};

export interface StammblattFormProps {
  initialData: StammblattData;
  onSave: (data: StammblattData) => Promise<void>;
  uploadPermitImage: (side: 'front' | 'back', file: File) => Promise<string>;
  language?: 'de' | 'en';
}

export function StammblattForm({ initialData, onSave, uploadPermitImage, language = 'de' }: StammblattFormProps) {
  const [data, setData] = useState<StammblattData>(initialData);
  const [saving, setSaving] = useState(false);
  // ... use the existing JSX, replace any "/api/worklog/:token/..." calls
  //     with calls to props.onSave / props.uploadPermitImage
  return (
    <Tabs defaultValue="personalien">
      <TabsList>
        <TabsTrigger value="personalien">Personalien</TabsTrigger>
        <TabsTrigger value="kinder">Kinder</TabsTrigger>
        <TabsTrigger value="aufenthalt">Aufenthalt</TabsTrigger>
        <TabsTrigger value="bank">Bank</TabsTrigger>
        <TabsTrigger value="mobility">Mobilität</TabsTrigger>
      </TabsList>
      {/* paste the existing 5 TabsContent blocks verbatim, bind to `data` state */}
    </Tabs>
  );
}
```

(Engineer: copy the existing JSX verbatim — translation strings, validation, image upload handler — and refit only the data plumbing to flow through props. Keep the saving UX identical.)

- [ ] **Step 8.3: Verify typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 8.4: Commit**

```bash
git add client/src/components/stammblatt/StammblattForm.tsx
git commit -m "refactor(stammblatt): extract shared <StammblattForm> from ExternalWorklog"
```

---

## Task 9: Wire `ExternalWorklog.tsx` to use `<StammblattForm>` + hide tabs when `personal_data_only`

**Files:**
- Modify: `client/src/pages/ExternalWorklog.tsx`

- [ ] **Step 9.1: Replace the 5 tab blocks with the new component**

In `ExternalWorklog.tsx`, replace the now-extracted personal-data tab JSX with:

```tsx
<StammblattForm
  initialData={personalData}
  onSave={async (data) => {
    await apiRequest(`/api/worklog/${token}/personal-data`, { method: 'PATCH', body: data });
  }}
  uploadPermitImage={async (side, file) => {
    // Reuse the existing 2-step flow: POST /api/worklog/:token/permit-image-upload
    // returns a presigned S3 PUT URL + final URL; PUT the file to the presigned URL;
    // return the final URL. This is the exact same code that was inline in
    // ExternalWorklog.tsx before the extract — copy it verbatim.
  }}
  language={language}
/>
```

- [ ] **Step 9.2: Conditionally hide Arbeitseinträge + Kontrakte tabs**

The outer Tabs around the whole page wraps both the StammblattForm and the Arbeitseinträge / Kontrakte sections. Add a check on the loaded link:

```tsx
const isPersonalDataOnly = linkData?.personalDataOnly === true;
```

In the outer `<TabsList>`, conditionally render:

```tsx
{!isPersonalDataOnly && <TabsTrigger value="entries">Arbeitseinträge</TabsTrigger>}
{!isPersonalDataOnly && <TabsTrigger value="contracts">Kontrakte</TabsTrigger>}
```

And wrap the corresponding `<TabsContent value="entries">` and `<TabsContent value="contracts">` in `{!isPersonalDataOnly && (...)}`.

Update the page header from "Arbeitszeiterfassung — {unitName}" to "Personalstammblatt — {hospitalName}" when `isPersonalDataOnly`.

- [ ] **Step 9.3: Extend the `GET /api/worklog/:token` response to include `personalDataOnly`**

In `server/routes/worklog.ts`, in the existing GET handler's response object, add:

```ts
personalDataOnly: link.personalDataOnly,
```

- [ ] **Step 9.4: Typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 9.5: Commit**

```bash
git add client/src/pages/ExternalWorklog.tsx server/routes/worklog.ts
git commit -m "$(cat <<'EOF'
feat(stammblatt): hide worklog tabs on personal-data-only token portal

Loads personalDataOnly from the link and conditionally hides
Arbeitseinträge + Kontrakte. Header switches to "Personalstammblatt
— {hospitalName}" in personal-data-only mode.
EOF
)"
```

---

## Task 10: `/profile/stammblatt` in-app page

**Files:**
- Create: `client/src/pages/profile/Stammblatt.tsx`
- Modify: `client/src/App.tsx` (or the routes file used in this project)

- [ ] **Step 10.1: Create the page**

```tsx
import { useEffect, useState } from "react";
import { StammblattForm, StammblattData } from "@/components/stammblatt/StammblattForm";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export default function ProfileStammblatt() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/me/stammblatt"],
    queryFn: () => apiRequest("/api/me/stammblatt"),
  });

  const save = useMutation({
    mutationFn: (patch: Partial<StammblattData>) =>
      apiRequest("/api/me/stammblatt", { method: "PATCH", body: patch }),
    onSuccess: (res) => {
      if (res.submittedAt) {
        toast({ title: t("stammblatt.submitted", "Personalstammblatt vollständig — vielen Dank.") });
      } else {
        toast({ title: t("stammblatt.saved", "Gespeichert") });
      }
    },
  });

  if (isLoading || !data) return <div className="p-6">…</div>;

  const initial: StammblattData = {
    firstName: data.firstName ?? "",
    lastName: data.lastName ?? "",
    profession: data.profession ?? "",
    address: data.address ?? "",
    city: data.city ?? "",
    zip: data.zip ?? "",
    dateOfBirth: data.dateOfBirth ?? "",
    maritalStatus: data.maritalStatus ?? "",
    nationality: data.nationality ?? "",
    religion: data.religion ?? "",
    mobile: data.mobile ?? "",
    ahvNumber: data.ahvNumber ?? "",
    hasChildBenefits: data.hasChildBenefits ?? false,
    numberOfChildren: data.numberOfChildren ?? 0,
    childBenefitsRecipient: data.childBenefitsRecipient ?? "",
    childBenefitsRegistration: data.childBenefitsRegistration ?? "",
    hasResidencePermit: data.hasResidencePermit ?? false,
    residencePermitType: data.residencePermitType ?? "",
    residencePermitValidUntil: data.residencePermitValidUntil ?? "",
    residencePermitFrontImage: data.residencePermitFrontImage ?? "",
    residencePermitBackImage: data.residencePermitBackImage ?? "",
    bankName: data.bankName ?? "",
    bankAddress: data.bankAddress ?? "",
    bankAccount: data.bankAccount ?? "",
    hasOwnVehicle: data.hasOwnVehicle ?? false,
  };

  return (
    <div className="container max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">{t("stammblatt.title", "Personalstammblatt")}</h1>
      <StammblattForm
        initialData={initial}
        onSave={(d) => save.mutateAsync(d)}
        uploadPermitImage={async () => {
          throw new Error("In-app permit image upload — wire to /api/me/stammblatt/permit-image-upload (see spec §8)");
        }}
      />
    </div>
  );
}
```

(Engineer: if image upload is needed in v1 of the self-fill path, add a parallel `/api/me/stammblatt/permit-image-upload` endpoint mirroring the existing `/api/worklog/:token/permit-image-upload` flow. If not needed for the first rollout, ship without it — users can still upload via the token-emailed flow.)

- [ ] **Step 10.2: Mount the route**

Add to the client router (in `client/src/App.tsx` or wherever Wouter / React Router routes live):

```tsx
<Route path="/profile/stammblatt" component={ProfileStammblatt} />
```

- [ ] **Step 10.3: Typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 10.4: Commit**

```bash
git add client/src/pages/profile/Stammblatt.tsx client/src/App.tsx
git commit -m "feat(stammblatt): in-app /profile/stammblatt page using shared <StammblattForm>"
```

---

## Task 11: `<StammblattBanner>` in app shell

**Files:**
- Create: `client/src/components/StammblattBanner.tsx`
- Modify: `client/src/App.tsx` (or the existing app-shell file)

- [ ] **Step 11.1: Create the banner component**

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const DISMISS_KEY = "stammblattBannerDismissed";

export function StammblattBanner() {
  const activeHospital = useActiveHospital();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");

  const enabled =
    activeHospital?.addonPersonalstammblatt === true &&
    (user as any)?.canLogin === true &&
    !dismissed;

  const { data } = useQuery({
    queryKey: ["/api/me/stammblatt", activeHospital?.id],
    queryFn: () => apiRequest("/api/me/stammblatt"),
    enabled,
  });

  if (!enabled) return null;
  if (!data || data.submittedAt) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
      <span className="text-sm text-amber-900">
        Ihr Personalstammblatt ist noch nicht ausgefüllt.
      </span>
      <div className="flex items-center gap-2">
        <Link href="/profile/stammblatt">
          <Button size="sm" variant="default">Jetzt ausfüllen</Button>
        </Link>
        <button
          onClick={() => { sessionStorage.setItem(DISMISS_KEY, "1"); setDismissed(true); }}
          aria-label="Dismiss"
          className="text-amber-900 hover:text-amber-700"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 11.2: Mount it in the app shell**

Find the app shell (`App.tsx` or `Layout.tsx`) and add `<StammblattBanner />` immediately above the main content area, after the topbar/header. Make sure it only renders inside the authenticated layout, not on `/auth` or `/worklog/:token` routes.

- [ ] **Step 11.3: Verify `useActiveHospital` exposes `addonPersonalstammblatt`**

Open `client/src/hooks/useActiveHospital.ts` (or wherever it lives). The hospital query should already return the full hospital record — verify the type includes `addonPersonalstammblatt`. If not, ensure the server's `/api/hospitals/active` response (or equivalent) selects this column. The Drizzle ORM should pick it up automatically once the schema is updated (Task 1).

- [ ] **Step 11.4: Typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 11.5: Commit**

```bash
git add client/src/components/StammblattBanner.tsx client/src/App.tsx
git commit -m "feat(stammblatt): app-shell banner prompting in-app users to complete their Stammblatt"
```

---

## Task 12: `/business/hr` UI — column, badges, buttons, filter, bulk action

**Files:**
- Create: `client/src/components/stammblatt/StammblattStatusBadge.tsx`
- Modify: `client/src/pages/business/SimplifiedStaff.tsx`

- [ ] **Step 12.1: Create the status badge**

```tsx
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type StammblattStatus = {
  status: 'missing' | 'invited' | 'in_progress' | 'submitted';
  inviteCount: number;
  lastInvitedAt?: string | null;
  submittedAt?: string | null;
};

function daysAgo(iso?: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export function StammblattStatusBadge({ value }: { value: StammblattStatus }) {
  const { status, inviteCount, lastInvitedAt, submittedAt } = value;
  const showFollowUpDot = status !== 'submitted' && inviteCount >= 3;

  const config = {
    missing:     { label: "Fehlt",          cls: "bg-red-100 text-red-800" },
    invited:     { label: "Eingeladen",     cls: "bg-amber-100 text-amber-800" },
    in_progress: { label: "In Bearbeitung", cls: "bg-blue-100 text-blue-800" },
    submitted:   { label: "Erhalten",       cls: "bg-green-100 text-green-800" },
  }[status];

  const sub =
    status === 'submitted'
      ? `am ${new Date(submittedAt!).toLocaleDateString()}`
      : inviteCount > 0
        ? `${inviteCount}× gesendet${lastInvitedAt ? ` · vor ${daysAgo(lastInvitedAt)}d` : ""}`
        : "";

  return (
    <div className="flex items-center gap-2">
      <Badge className={config.cls}>{config.label}</Badge>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      {showFollowUpDot && (
        <Tooltip>
          <TooltipTrigger><span className="w-2 h-2 rounded-full bg-red-600" /></TooltipTrigger>
          <TooltipContent>3+ Einladungen versendet — persönlich nachfassen?</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
```

- [ ] **Step 12.2: Add the column and per-row action to `SimplifiedStaff.tsx`**

In `client/src/pages/business/SimplifiedStaff.tsx`:

1. Read `activeHospital?.addonPersonalstammblatt` and `isManager`. Compute `const stammblattEnabled = !!activeHospital?.addonPersonalstammblatt && isManager;`.
2. Add a new column header "Personalstammblatt" inside `{stammblattEnabled && <th>…</th>}`, placed between Staff Type and Actions.
3. In each row, add `{stammblattEnabled && <td><StammblattStatusBadge value={staff.stammblatt} /></td>}`.
4. Add a per-row "Send invite" / "Resend" button (or menu item) that calls:

```ts
const inviteMutation = useMutation({
  mutationFn: (userId: string) =>
    apiRequest(`/api/business/${activeHospital!.id}/staff/${userId}/stammblatt-invite`, { method: 'POST' }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: [`/api/business/${activeHospital!.id}/staff`] });
    toast({ title: "Einladung verschickt" });
  },
});
```

Button text:
- `missing` → "Einladung senden"
- `invited` / `in_progress` → "Erneut senden"
- `submitted` → "Stammblatt anzeigen" (opens the existing details dialog — no new dialog).

Disable the send button when `!staff.email || staff.email.endsWith("@staff.local")`. Show tooltip "Keine gültige E-Mail-Adresse hinterlegt".

- [ ] **Step 12.3: Add the "show incomplete only" filter chip**

Above the table, gated by `stammblattEnabled`:

```tsx
const [onlyIncomplete, setOnlyIncomplete] = useState(false);
// ...
{stammblattEnabled && (
  <button
    onClick={() => setOnlyIncomplete(v => !v)}
    className={`px-3 py-1 rounded-full text-xs ${onlyIncomplete ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}
  >
    Nur unvollständig anzeigen
  </button>
)}
```

Filter the rendered rows: `staff.filter(s => !onlyIncomplete || s.stammblatt.status !== 'submitted')`.

- [ ] **Step 12.4: Add the bulk-send action**

Above the table, gated by `stammblattEnabled`:

```tsx
const bulkMutation = useMutation({
  mutationFn: () =>
    apiRequest(`/api/business/${activeHospital!.id}/staff/stammblatt-invite/bulk`, {
      method: 'POST',
      body: { scope: 'all_incomplete' },
    }),
  onSuccess: (res) => {
    queryClient.invalidateQueries({ queryKey: [`/api/business/${activeHospital!.id}/staff`] });
    toast({
      title: `${res.sent} Einladungen verschickt`,
      description: res.skipped.length > 0 ? `${res.skipped.length} übersprungen` : undefined,
    });
  },
});
```

With a confirm dialog (count of eligible rows shown before send).

- [ ] **Step 12.5: Typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 12.6: Commit**

```bash
git add client/src/components/stammblatt/StammblattStatusBadge.tsx client/src/pages/business/SimplifiedStaff.tsx
git commit -m "$(cat <<'EOF'
feat(stammblatt): HR staff list — status column, per-row send, bulk send, filter

New Personalstammblatt column shows colored status with sent-count hint
and a 3+ follow-up dot. Per-row send/resend button + "Show only
incomplete" filter chip + bulk-send-to-all-incomplete action. All gated
by activeHospital.addonPersonalstammblatt.
EOF
)"
```

---

## Task 13: Admin Settings toggle

**Files:**
- Modify: `client/src/pages/admin/Settings.tsx`

- [ ] **Step 13.1: Add the toggle row in the Experimental tab**

Find the existing `addonPatientChat` toggle block (around line 2176). Directly below it, add:

```tsx
<div className="flex items-center justify-between p-4 border rounded-lg">
  <div>
    <div className="font-medium">
      {t("admin.experimental.stammblatt.title", "Personalstammblatt für alle Mitarbeiter")}
    </div>
    <div className="text-sm text-muted-foreground">
      {t("admin.experimental.stammblatt.desc",
        "Aktiviert die HR-Funktion, mit der für alle Mitarbeiter (intern und extern) ein Personalstammblatt eingeholt werden kann.")}
    </div>
  </div>
  <Switch
    checked={hospitalForm.addonPersonalstammblatt ?? false}
    onCheckedChange={(checked) => {
      setHospitalForm(prev => ({ ...prev, addonPersonalstammblatt: checked }));
      updateHospitalMutation.mutate({ ...hospitalForm, addonPersonalstammblatt: checked });
    }}
  />
</div>
```

- [ ] **Step 13.2: Add the field to the form state initializers**

Find the `hospitalForm` state init (around line 72) and the `setHospitalForm` reset block (around line 187). Add:

```ts
addonPersonalstammblatt: false, // line 72 init
// ...
addonPersonalstammblatt: fullHospitalData.addonPersonalstammblatt ?? false, // line 187 reset
```

- [ ] **Step 13.3: Confirm the PATCH route accepts the field**

Run `grep -rn "addonPatientChat" server/ --include="*.ts"` to find the existing allowlist (likely in `server/routes/hospitals.ts` or `server/routes.ts`). In that same allowlist block, add `addonPersonalstammblatt` next to `addonPatientChat`:

```ts
// In the field allowlist for the hospital PATCH handler:
addonPatientChat,
addonPersonalstammblatt,  // new
```

If the handler uses a free-form spread without an allowlist, no change is needed beyond the schema update from Task 1.

- [ ] **Step 13.4: Typecheck**

Run: `npm run check`
Expected: clean.

- [ ] **Step 13.5: Commit**

```bash
git add client/src/pages/admin/Settings.tsx server/routes/hospitals.ts
git commit -m "feat(stammblatt): admin toggle in Experimental tab"
```

---

## Task 14: Final verification

**Files:** (none)

- [ ] **Step 14.1: Full typecheck**

Run: `npm run check`
Expected: clean across both client and server.

- [ ] **Step 14.2: Full test suite**

Run: `npm test`
Expected: all tests green, including the 5 new spec files and no regression in existing tests.

- [ ] **Step 14.3: Verify migration idempotency**

Run: `psql "$DATABASE_URL" -f migrations/0265_personalstammblatt_addon.sql`
Then run it again.
Expected: second run succeeds with no errors.

- [ ] **Step 14.4: Manual QA — dev server**

Run: `npm run dev`

Open the app in a browser:

1. As an admin on the target clinic: `/admin → Settings → Experimental` — toggle on the Personalstammblatt switch. Reload `/business/hr` — confirm the new column appears, badges render correctly for known rows.
2. Click "Einladung senden" on a Missing row — verify a toast and the badge changes to "Eingeladen".
3. As a logged-in non-admin user with `canLogin=true` on the same clinic — confirm the top banner appears, click "Jetzt ausfüllen", land on `/profile/stammblatt`, fill the required minimums, hit save, banner disappears.
4. Open the email link from step 2 in an incognito tab — confirm the public form renders only the 5 Stammblatt tabs (no Arbeitseinträge / Kontrakte).
5. Toggle the addon back off — confirm the column, banner, and per-row buttons all disappear; existing emailed links still work (form opens).
6. Existing external-worker flow: pick an existing external worker, open their `/worklog/:token` link — confirm all 7 tabs still render (no regression).

- [ ] **Step 14.5: Code review**

Use `superpowers:requesting-code-review` to dispatch a final reviewer covering the entire branch diff. Apply any blocking feedback before merging.

- [ ] **Step 14.6: Final commit / branch state**

If reviewer requested changes, address them with follow-up commits. Leave the branch in a clean state ready for merge — do **not** push without the user's explicit go-ahead (per project memory).
