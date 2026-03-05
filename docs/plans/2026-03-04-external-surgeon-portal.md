# External Surgeon Portal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a portal where external surgeons can view their surgeries at a hospital and request cancellations, rescheduling, or suspensions — with clinic staff accepting/refusing from the existing sidebar.

**Architecture:** New `surgeon_action_requests` table stores change requests. Surgeon portal reuses the hospital's `externalSurgeryToken` with email-based OTP auth. Surgeries are aggregated from both external requests and direct planning. Admin sidebar gets a new tab for action requests with accept/refuse buttons that auto-apply changes.

**Tech Stack:** React + shadcn/ui (frontend), Express + Drizzle ORM (backend), Resend email + SMS notifications, existing OTP/magic link auth system.

---

### Task 1: Schema — Add `surgeonEmail` to portal sessions + `surgeon_action_requests` table

**Files:**
- Modify: `shared/schema.ts:5824-5835` (portalAccessSessions table)
- Modify: `shared/schema.ts` (add new table after line ~5838)

**Step 1: Add `surgeonEmail` to `portalAccessSessions`**

In `shared/schema.ts`, add a `surgeonEmail` field to the `portalAccessSessions` table:

```typescript
export const portalAccessSessions = pgTable("portal_access_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionToken: varchar("session_token", { length: 128 }).notNull().unique(),
  portalType: portalTypeEnum("portal_type").notNull(),
  portalToken: varchar("portal_token").notNull(),
  surgeonEmail: varchar("surgeon_email"),  // NEW — only for surgeon portal
  expiresAt: timestamp("expires_at").notNull(),
  verifiedAt: timestamp("verified_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_portal_sessions_token").on(table.sessionToken),
  index("idx_portal_sessions_portal").on(table.portalType, table.portalToken),
]);
```

**Step 2: Add `surgeonActionRequestTypeEnum`, `surgeonActionRequestStatusEnum`, and `surgeonActionRequests` table**

After the `PortalAccessSession` type export (~line 5838), add:

```typescript
export const surgeonActionRequestTypeEnum = pgEnum("surgeon_action_request_type", [
  "cancellation", "reschedule", "suspension"
]);

export const surgeonActionRequestStatusEnum = pgEnum("surgeon_action_request_status", [
  "pending", "accepted", "refused"
]);

export const surgeonActionRequests = pgTable("surgeon_action_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  surgeryId: varchar("surgery_id").notNull().references(() => surgeries.id),
  surgeonEmail: varchar("surgeon_email").notNull(),
  type: surgeonActionRequestTypeEnum("type").notNull(),
  reason: text("reason").notNull(),
  proposedDate: date("proposed_date"),
  proposedTimeFrom: integer("proposed_time_from"),
  proposedTimeTo: integer("proposed_time_to"),
  status: surgeonActionRequestStatusEnum("status").notNull().default("pending"),
  responseNote: text("response_note"),
  respondedBy: varchar("responded_by").references(() => users.id),
  respondedAt: timestamp("responded_at"),
  confirmationEmailSent: boolean("confirmation_email_sent").default(false),
  confirmationSmsSent: boolean("confirmation_sms_sent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_surgeon_action_requests_hospital_status").on(table.hospitalId, table.status),
  index("idx_surgeon_action_requests_surgery").on(table.surgeryId),
  index("idx_surgeon_action_requests_email").on(table.surgeonEmail),
]);

export type SurgeonActionRequest = typeof surgeonActionRequests.$inferSelect;
```

**Step 3: Generate and fix migration**

Run: `npm run db:generate`

Then make the generated SQL idempotent:
- `ALTER TABLE portal_access_sessions ADD COLUMN IF NOT EXISTS surgeon_email VARCHAR;`
- `CREATE TABLE IF NOT EXISTS surgeon_action_requests ...`
- `CREATE INDEX IF NOT EXISTS ...`
- For enums, use `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`

**Step 4: Push migration**

Run: `npm run db:migrate`

**Step 5: Verify TypeScript**

Run: `npm run check`

**Step 6: Commit**

```bash
git add shared/schema.ts migrations/
git commit -m "feat: add surgeon_action_requests table and surgeonEmail to portal sessions"
```

---

### Task 2: Storage layer — surgeon portal data access functions

**Files:**
- Create: `server/storage/surgeonPortal.ts`

**Step 1: Create the storage file**

```typescript
import { db } from "../db";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  surgeonActionRequests,
  surgeries,
  surgeryRooms,
  externalSurgeryRequests,
  users,
  patients,
  hospitals,
  portalAccessSessions,
  type SurgeonActionRequest,
} from "@shared/schema";

// ========== SURGERY AGGREGATION ==========

/**
 * Get all surgeries for a surgeon email at a hospital.
 * Union of: (1) surgeries linked from external requests by this email,
 *           (2) surgeries where main surgeon user's email matches.
 * Deduplicated by surgery ID.
 */
export async function getSurgeriesForSurgeon(
  hospitalId: string,
  surgeonEmail: string,
  month?: string, // "YYYY-MM"
): Promise<any[]> {
  const email = surgeonEmail.toLowerCase();

  // Source 1: surgery IDs from external requests
  const fromRequests = await db
    .select({ surgeryId: externalSurgeryRequests.surgeryId })
    .from(externalSurgeryRequests)
    .where(
      and(
        eq(externalSurgeryRequests.hospitalId, hospitalId),
        eq(externalSurgeryRequests.status, "scheduled"),
        sql`LOWER(${externalSurgeryRequests.surgeonEmail}) = ${email}`,
        sql`${externalSurgeryRequests.surgeryId} IS NOT NULL`,
      ),
    );

  const requestSurgeryIds = fromRequests
    .map((r) => r.surgeryId)
    .filter(Boolean) as string[];

  // Source 2: surgeries where main surgeon's email matches
  const fromDirect = await db
    .select({ surgeryId: surgeries.id })
    .from(surgeries)
    .innerJoin(users, eq(surgeries.surgeonId, users.id))
    .where(
      and(
        eq(surgeries.hospitalId, hospitalId),
        sql`LOWER(${users.email}) = ${email}`,
      ),
    );

  const directSurgeryIds = fromDirect.map((r) => r.surgeryId);

  // Deduplicate
  const allIds = [...new Set([...requestSurgeryIds, ...directSurgeryIds])];
  if (allIds.length === 0) return [];

  // Fetch full surgery data with joins
  let query = db
    .select({
      id: surgeries.id,
      plannedDate: surgeries.plannedDate,
      plannedSurgery: surgeries.plannedSurgery,
      chopCode: surgeries.chopCode,
      status: surgeries.status,
      isSuspended: surgeries.isSuspended,
      isArchived: surgeries.isArchived,
      surgeryDurationMinutes: surgeries.surgeryDurationMinutes,
      patientPosition: surgeries.patientPosition,
      surgeonName: surgeries.surgeon,
      roomName: surgeryRooms.name,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
    })
    .from(surgeries)
    .leftJoin(surgeryRooms, eq(surgeries.surgeryRoomId, surgeryRooms.id))
    .leftJoin(patients, eq(surgeries.patientId, patients.id))
    .where(
      and(
        inArray(surgeries.id, allIds),
        eq(surgeries.isArchived, false),
        sql`${surgeries.status} != 'cancelled'`,
      ),
    );

  // Filter by month if provided
  if (month) {
    const [year, mon] = month.split("-");
    const startDate = `${year}-${mon}-01`;
    const endDate = `${year}-${mon}-31`;
    query = query.where(
      sql`${surgeries.plannedDate} >= ${startDate}::date AND ${surgeries.plannedDate} <= ${endDate}::date + interval '1 day'`,
    ) as any;
  }

  return query;
}

// ========== ACTION REQUESTS ==========

export async function createSurgeonActionRequest(
  data: Omit<SurgeonActionRequest, "id" | "createdAt" | "updatedAt" | "status" | "responseNote" | "respondedBy" | "respondedAt" | "confirmationEmailSent" | "confirmationSmsSent">,
): Promise<SurgeonActionRequest> {
  const [request] = await db
    .insert(surgeonActionRequests)
    .values(data)
    .returning();
  return request;
}

export async function getSurgeonActionRequests(
  hospitalId: string,
  status?: string,
): Promise<any[]> {
  const conditions = [eq(surgeonActionRequests.hospitalId, hospitalId)];
  if (status) {
    conditions.push(eq(surgeonActionRequests.status, status as any));
  }

  return db
    .select({
      id: surgeonActionRequests.id,
      hospitalId: surgeonActionRequests.hospitalId,
      surgeryId: surgeonActionRequests.surgeryId,
      surgeonEmail: surgeonActionRequests.surgeonEmail,
      type: surgeonActionRequests.type,
      reason: surgeonActionRequests.reason,
      proposedDate: surgeonActionRequests.proposedDate,
      proposedTimeFrom: surgeonActionRequests.proposedTimeFrom,
      proposedTimeTo: surgeonActionRequests.proposedTimeTo,
      status: surgeonActionRequests.status,
      responseNote: surgeonActionRequests.responseNote,
      respondedAt: surgeonActionRequests.respondedAt,
      createdAt: surgeonActionRequests.createdAt,
      // Surgery info
      plannedDate: surgeries.plannedDate,
      plannedSurgery: surgeries.plannedSurgery,
      surgeonName: surgeries.surgeon,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      roomName: surgeryRooms.name,
    })
    .from(surgeonActionRequests)
    .innerJoin(surgeries, eq(surgeonActionRequests.surgeryId, surgeries.id))
    .leftJoin(patients, eq(surgeries.patientId, patients.id))
    .leftJoin(surgeryRooms, eq(surgeries.surgeryRoomId, surgeryRooms.id))
    .where(and(...conditions))
    .orderBy(surgeonActionRequests.createdAt);
}

export async function getSurgeonActionRequest(id: string) {
  const [request] = await db
    .select()
    .from(surgeonActionRequests)
    .where(eq(surgeonActionRequests.id, id))
    .limit(1);
  return request;
}

export async function updateSurgeonActionRequest(
  id: string,
  updates: Partial<SurgeonActionRequest>,
) {
  const [updated] = await db
    .update(surgeonActionRequests)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(surgeonActionRequests.id, id))
    .returning();
  return updated;
}

export async function getPendingSurgeonActionRequestsCount(
  hospitalId: string,
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(surgeonActionRequests)
    .where(
      and(
        eq(surgeonActionRequests.hospitalId, hospitalId),
        eq(surgeonActionRequests.status, "pending"),
      ),
    );
  return result?.count ?? 0;
}

export async function getActionRequestsForSurgery(
  surgeryId: string,
  surgeonEmail: string,
): Promise<SurgeonActionRequest[]> {
  return db
    .select()
    .from(surgeonActionRequests)
    .where(
      and(
        eq(surgeonActionRequests.surgeryId, surgeryId),
        sql`LOWER(${surgeonActionRequests.surgeonEmail}) = ${surgeonEmail.toLowerCase()}`,
        eq(surgeonActionRequests.status, "pending"),
      ),
    );
}

// ========== SESSION HELPERS ==========

export async function findPortalSessionWithEmail(
  sessionToken: string,
  portalType: string,
  portalToken: string,
): Promise<{ valid: boolean; surgeonEmail: string | null }> {
  const [session] = await db
    .select()
    .from(portalAccessSessions)
    .where(
      and(
        eq(portalAccessSessions.sessionToken, sessionToken),
        eq(portalAccessSessions.portalType, portalType as any),
        eq(portalAccessSessions.portalToken, portalToken),
      ),
    )
    .limit(1);

  if (!session || new Date(session.expiresAt) < new Date()) {
    return { valid: false, surgeonEmail: null };
  }

  return { valid: true, surgeonEmail: session.surgeonEmail };
}

export async function getHospitalByExternalSurgeryToken(token: string) {
  const [hospital] = await db
    .select({
      id: hospitals.id,
      name: hospitals.name,
      defaultLanguage: hospitals.defaultLanguage,
    })
    .from(hospitals)
    .where(eq(hospitals.externalSurgeryToken, token))
    .limit(1);
  return hospital;
}
```

**Step 2: Run TypeScript check**

Run: `npm run check`

**Step 3: Commit**

```bash
git add server/storage/surgeonPortal.ts
git commit -m "feat: add storage layer for surgeon portal"
```

---

### Task 3: Auth — Adapt OTP flow for surgeon portal (email-input gate)

**Files:**
- Modify: `server/routes/portalOtp.ts:73-136` (resolveContactInfo — add surgeon case)
- Modify: `server/storage/portalOtp.ts:99-113` (createPortalSession — accept surgeonEmail)
- Modify: `server/routes/portalOtp.ts:183-263` (request-code — accept email from body for surgeon)
- Modify: `server/routes/portalOtp.ts:269+` (magic link handler — store surgeonEmail in session)
- Modify: `server/routes/portalOtp.ts` (verify-code — store surgeonEmail in session)

**Step 1: Update `resolveContactInfo` in `portalOtp.ts` to handle surgeon portal**

The surgeon portal is different: the email comes from the request body (the surgeon enters it), not from a linked record. Add a surgeon case in `resolveContactInfo`:

```typescript
if (portalType === "surgeon") {
  // Surgeon portal uses hospital's externalSurgeryToken
  const [hospital] = await db
    .select()
    .from(hospitals)
    .where(eq(hospitals.externalSurgeryToken, portalToken))
    .limit(1);

  if (!hospital) return empty;

  return {
    email: null,  // Will be provided by surgeon in request body
    phone: null,
    language: hospital.defaultLanguage || "de",
    hospitalName: hospital.name || "Viali",
    valid: true,
  };
}
```

Add this before the `return empty;` at line 135.

**Step 2: Update `createPortalSession` to accept optional `surgeonEmail`**

In `server/storage/portalOtp.ts`, modify `createPortalSession`:

```typescript
export async function createPortalSession(
  portalType: PortalType,
  portalToken: string,
  surgeonEmail?: string,
): Promise<string> {
  const sessionToken = randomBytes(32).toString("hex");

  await db.insert(portalAccessSessions).values({
    sessionToken,
    portalType,
    portalToken,
    surgeonEmail: surgeonEmail || null,
    expiresAt: new Date(Date.now() + SESSION_DURATIONS[portalType]),
  });

  return sessionToken;
}
```

**Step 3: Update `request-code` endpoint for surgeon portal**

For surgeon portal, the email is provided in the request body (not resolved from a linked record). Modify the request-code handler (~line 207-216):

After `const info = await resolveContactInfo(portalType, token);` add:

```typescript
// For surgeon portal, email comes from request body
let deliverTo: string | null;
if (portalType === "surgeon") {
  const { email } = req.body as { email?: string; method?: string };
  if (!email || !email.includes("@")) {
    return res.json({ sent: true }); // Don't leak validation errors
  }
  deliverTo = email;
} else {
  deliverTo = method === "email" ? info.email : info.phone;
}
```

Replace the existing `deliverTo` logic (~lines 213-217).

**Step 4: Update magic link handler to pass surgeonEmail to session**

In the magic link verify endpoint (~line 269+), when creating the session, get the `deliveredTo` from the verification code and pass it:

```typescript
const surgeonEmail = code.portalType === "surgeon" ? code.deliveredTo : undefined;
const sessionToken = await createPortalSession(code.portalType, code.portalToken, surgeonEmail);
```

**Step 5: Update verify-code endpoint similarly**

In the verify-code handler, when creating the session after successful code verification, pass the surgeon email:

```typescript
const surgeonEmail = portalType === "surgeon" ? activeCode.deliveredTo : undefined;
const sessionToken = await createPortalSession(portalType, token, surgeonEmail);
```

**Step 6: Update hint endpoint for surgeon portal**

For surgeon portal, the hint endpoint should return hospital info but indicate "email input required" mode. The existing response format works — `emailHint: null` and `hasPhone: false` will make the gate show the email input.

**Step 7: Run TypeScript check**

Run: `npm run check`

**Step 8: Commit**

```bash
git add server/routes/portalOtp.ts server/storage/portalOtp.ts
git commit -m "feat: adapt OTP auth flow for surgeon portal email-based gate"
```

---

### Task 4: Backend — Surgeon portal API routes

**Files:**
- Create: `server/routes/surgeonPortal.ts`
- Modify: `server/routes.ts` (register new router)

**Step 1: Create the surgeon portal routes file**

```typescript
import { Router, Request, Response } from "express";
import logger from "../logger";
import { findPortalSessionWithEmail, getSurgeriesForSurgeon, createSurgeonActionRequest, getActionRequestsForSurgery, getHospitalByExternalSurgeryToken } from "../storage/surgeonPortal";
import { sendSurgeonActionRequestNotification } from "../resend";

const router = Router();

/**
 * Middleware: verify surgeon portal session and extract email
 */
async function requireSurgeonSession(req: Request, res: Response, next: any) {
  const { token } = req.params;
  const sessionToken = req.cookies?.portal_session;

  if (!sessionToken) {
    return res.status(403).json({ requiresVerification: true, portalType: "surgeon" });
  }

  const session = await findPortalSessionWithEmail(sessionToken, "surgeon", token);
  if (!session.valid || !session.surgeonEmail) {
    return res.status(403).json({ requiresVerification: true, portalType: "surgeon" });
  }

  // Attach to request for downstream handlers
  (req as any).surgeonEmail = session.surgeonEmail;
  (req as any).portalToken = token;
  next();
}

router.use("/api/surgeon-portal/:token", requireSurgeonSession);

/**
 * GET /api/surgeon-portal/:token/surgeries?month=YYYY-MM
 */
router.get("/api/surgeon-portal/:token/surgeries", async (req: Request, res: Response) => {
  try {
    const surgeonEmail = (req as any).surgeonEmail;
    const { token } = req.params;
    const month = req.query.month as string | undefined;

    const hospital = await getHospitalByExternalSurgeryToken(token);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    const surgeriesList = await getSurgeriesForSurgeon(hospital.id, surgeonEmail, month);

    // For each surgery, get any pending action requests from this surgeon
    const surgeryIds = surgeriesList.map((s: any) => s.id);
    const actionRequests: Record<string, any[]> = {};
    for (const sid of surgeryIds) {
      const pending = await getActionRequestsForSurgery(sid, surgeonEmail);
      if (pending.length > 0) {
        actionRequests[sid] = pending;
      }
    }

    return res.json({
      hospitalName: hospital.name,
      surgeries: surgeriesList,
      pendingRequests: actionRequests,
    });
  } catch (error) {
    logger.error("[SurgeonPortal] Error fetching surgeries:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /api/surgeon-portal/:token/action-requests
 * Body: { surgeryId, type, reason, proposedDate?, proposedTimeFrom?, proposedTimeTo? }
 */
router.post("/api/surgeon-portal/:token/action-requests", async (req: Request, res: Response) => {
  try {
    const surgeonEmail = (req as any).surgeonEmail;
    const { token } = req.params;
    const { surgeryId, type, reason, proposedDate, proposedTimeFrom, proposedTimeTo } = req.body;

    if (!surgeryId || !type || !reason) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!["cancellation", "reschedule", "suspension"].includes(type)) {
      return res.status(400).json({ message: "Invalid request type" });
    }

    const hospital = await getHospitalByExternalSurgeryToken(token);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    // Check no duplicate pending request for same surgery+type
    const existing = await getActionRequestsForSurgery(surgeryId, surgeonEmail);
    const duplicate = existing.find((r) => r.type === type);
    if (duplicate) {
      return res.status(409).json({ message: "A pending request of this type already exists" });
    }

    const request = await createSurgeonActionRequest({
      hospitalId: hospital.id,
      surgeryId,
      surgeonEmail,
      type,
      reason,
      proposedDate: proposedDate || null,
      proposedTimeFrom: proposedTimeFrom ?? null,
      proposedTimeTo: proposedTimeTo ?? null,
    });

    // Send notification to clinic (fire-and-forget)
    try {
      await sendSurgeonActionRequestNotification(hospital, request, surgeonEmail);
    } catch (e) {
      logger.error("[SurgeonPortal] Failed to send notification:", e);
    }

    return res.status(201).json(request);
  } catch (error) {
    logger.error("[SurgeonPortal] Error creating action request:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
```

**Step 2: Register the router**

In `server/routes.ts`, add:

```typescript
import surgeonPortalRouter from "./routes/surgeonPortal";
// ...
app.use(surgeonPortalRouter);
```

Find where other portal routers are registered (worklog, portalOtp) and add it nearby.

**Step 3: Run TypeScript check**

Run: `npm run check`

**Step 4: Commit**

```bash
git add server/routes/surgeonPortal.ts server/routes.ts
git commit -m "feat: add surgeon portal API routes (surgeries list + action requests)"
```

---

### Task 5: Backend — Admin routes for accept/refuse action requests

**Files:**
- Modify: `server/routes/externalSurgery.ts` (add admin endpoints for surgeon action requests)

**Step 1: Add admin endpoints**

Add these endpoints to `server/routes/externalSurgery.ts` (at the end, before `export default router`):

```typescript
// ========== SURGEON ACTION REQUESTS (Admin) ==========

import { getSurgeonActionRequests, getSurgeonActionRequest, updateSurgeonActionRequest, getPendingSurgeonActionRequestsCount } from "../storage/surgeonPortal";

/**
 * GET /api/hospitals/:hospitalId/surgeon-action-requests
 */
router.get("/api/hospitals/:hospitalId/surgeon-action-requests", isAuthenticated, async (req: any, res: Response) => {
  const { hospitalId } = req.params;
  const status = req.query.status as string | undefined;
  const requests = await getSurgeonActionRequests(hospitalId, status);
  return res.json(requests);
});

/**
 * GET /api/hospitals/:hospitalId/surgeon-action-requests/count
 */
router.get("/api/hospitals/:hospitalId/surgeon-action-requests/count", isAuthenticated, async (req: any, res: Response) => {
  const { hospitalId } = req.params;
  const count = await getPendingSurgeonActionRequestsCount(hospitalId);
  return res.json({ count });
});

/**
 * POST /api/hospitals/:hospitalId/surgeon-action-requests/:reqId/accept
 * Auto-applies the action to the surgery.
 */
router.post("/api/hospitals/:hospitalId/surgeon-action-requests/:reqId/accept", isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { reqId } = req.params;
    const actionReq = await getSurgeonActionRequest(reqId);
    if (!actionReq || actionReq.status !== "pending") {
      return res.status(404).json({ message: "Request not found or already processed" });
    }

    const userId = req.user?.id;

    if (actionReq.type === "cancellation") {
      // Cancel the surgery
      await storage.updateSurgery(actionReq.surgeryId, { status: "cancelled" });
    } else if (actionReq.type === "suspension") {
      // Suspend the surgery
      await storage.updateSurgery(actionReq.surgeryId, { isSuspended: true });
    }
    // For reschedule: the frontend opens a scheduling dialog.
    // The accept endpoint just marks the request as accepted.
    // The new surgery is created via the standard surgery creation flow.

    await updateSurgeonActionRequest(reqId, {
      status: "accepted",
      respondedBy: userId,
      respondedAt: new Date(),
      responseNote: req.body.responseNote || null,
    });

    // Send confirmation to surgeon (fire-and-forget)
    try {
      await sendSurgeonActionResponseEmail(actionReq, "accepted", req.body.responseNote);
    } catch (e) {
      logger.error("[SurgeonActionReq] Failed to send acceptance email:", e);
    }

    return res.json({ success: true });
  } catch (error) {
    logger.error("[SurgeonActionReq] Error accepting request:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /api/hospitals/:hospitalId/surgeon-action-requests/:reqId/refuse
 */
router.post("/api/hospitals/:hospitalId/surgeon-action-requests/:reqId/refuse", isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { reqId } = req.params;
    const actionReq = await getSurgeonActionRequest(reqId);
    if (!actionReq || actionReq.status !== "pending") {
      return res.status(404).json({ message: "Request not found or already processed" });
    }

    const userId = req.user?.id;

    await updateSurgeonActionRequest(reqId, {
      status: "refused",
      respondedBy: userId,
      respondedAt: new Date(),
      responseNote: req.body.responseNote || null,
    });

    // Send refusal email to surgeon (fire-and-forget)
    try {
      await sendSurgeonActionResponseEmail(actionReq, "refused", req.body.responseNote);
    } catch (e) {
      logger.error("[SurgeonActionReq] Failed to send refusal email:", e);
    }

    return res.json({ success: true });
  } catch (error) {
    logger.error("[SurgeonActionReq] Error refusing request:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});
```

**Step 2: Add imports**

Make sure `storage` (from `../storage/clinic` or wherever `updateSurgery` lives) is imported, along with the new email function.

**Step 3: Run TypeScript check**

Run: `npm run check`

**Step 4: Commit**

```bash
git add server/routes/externalSurgery.ts
git commit -m "feat: add admin accept/refuse endpoints for surgeon action requests"
```

---

### Task 6: Email notifications for surgeon action requests

**Files:**
- Modify: `server/resend.ts` (add notification functions)

**Step 1: Add `sendSurgeonActionRequestNotification`**

This notifies the clinic when a surgeon submits a cancellation/reschedule/suspension request. Follow the existing pattern of `sendExternalSurgeryRequestNotification` (~line 299).

The function should:
- Send to `hospital.externalSurgeryNotificationEmail` or fallback to OR admins
- Include: request type, surgeon name/email, surgery info, reason, proposed date (for reschedule)
- Include deep link to the admin panel
- Support de/en based on `hospital.defaultLanguage`

**Step 2: Add `sendSurgeonActionResponseEmail`**

This notifies the surgeon when their request is accepted/refused. Follow the existing pattern of `sendExternalSurgeryDeclineNotification` (~line 400).

The function should:
- Send to surgeon's email
- Include: result (accepted/refused), surgery info, response note (if any)
- Include link to surgeon portal
- SMS fallback if email fails
- Support de/en based on `hospital.defaultLanguage`

**Step 3: Run TypeScript check**

Run: `npm run check`

**Step 4: Commit**

```bash
git add server/resend.ts
git commit -m "feat: add email notifications for surgeon action requests"
```

---

### Task 7: Frontend — Surgeon portal page with calendar

**Files:**
- Create: `client/src/pages/SurgeonPortal.tsx`
- Modify: `client/src/App.tsx:72,165` (add lazy import + route)

**Step 1: Add route in App.tsx**

Add lazy import (~line 72):
```typescript
const SurgeonPortal = React.lazy(() => import("@/pages/SurgeonPortal"));
```

Add public route (~line 165, after the external-surgery route):
```typescript
<Route path="/surgeon-portal/:token" component={SurgeonPortal} />
```

**Step 2: Create `SurgeonPortal.tsx`**

This is the main portal page. It follows the same pattern as `ExternalWorklog.tsx`:
- Wrapped in a custom verification gate (since surgeon portal needs email input)
- Month calendar view (reuse the grid layout pattern from `PlanningCalendar.tsx`)
- Day selection → detail panel with action buttons

The component should have:

1. **SurgeonPortalGate** — Custom verification wrapper:
   - Similar to `PortalVerificationGate` but adds an email input field
   - States: "checking" → "enter-email" → "verify-code" → "verified"
   - When checking session, probe `GET /api/surgeon-portal/:token/surgeries` (200 = verified, 403 = need auth)
   - Email input → `POST /api/portal-auth/surgeon/:token/request-code` with `{ method: "email", email }`
   - OTP input → `POST /api/portal-auth/surgeon/:token/verify-code`
   - On success → reload page (cookie set)

2. **SurgeonPortalContent** — Main content after auth:
   - Fetch surgeries: `GET /api/surgeon-portal/:token/surgeries?month=YYYY-MM`
   - Render month calendar grid (same pattern as `PlanningCalendar.tsx`)
   - Day cells show colored dots for surgeries
   - Selected day detail panel lists surgeries with action buttons
   - Action buttons open dialogs:
     - **Request Cancellation**: Dialog with textarea for reason (required)
     - **Request Reschedule**: Dialog with textarea for reason + optional date picker + optional time range
     - **Request Suspension**: Dialog with textarea for reason (required)
   - Submit: `POST /api/surgeon-portal/:token/action-requests`
   - If surgery already has pending request, show status badge instead of buttons

3. **Translations**: Support de/en (same as worklog portal). Use inline translation objects like `PortalVerificationGate.tsx` does.

**Step 3: Run dev server and verify**

Run: `npm run dev`
Navigate to `/surgeon-portal/:token` and verify the gate appears.

**Step 4: Commit**

```bash
git add client/src/pages/SurgeonPortal.tsx client/src/App.tsx
git commit -m "feat: add surgeon portal page with calendar and action request dialogs"
```

---

### Task 8: Frontend — Link on external surgery request form

**Files:**
- Modify: `client/src/pages/ExternalSurgeryRequest.tsx:93+` (add banner/link near the top of the form)

**Step 1: Add "View your surgeries" link**

After the hospital data is loaded and the form is rendered, add a visible link at the top. Find where the main Card/form layout starts and add a banner above or inside the header area:

```tsx
{hospitalData && !isSubmitted && (
  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2">
    <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
    <span className="text-sm text-blue-700 dark:text-blue-300">
      {i18n.language === 'de'
        ? 'Haben Sie bereits Anfragen gestellt?'
        : 'Already submitted requests?'}
      {' '}
      <a
        href={`/surgeon-portal/${token}`}
        className="font-medium underline hover:no-underline"
      >
        {i18n.language === 'de' ? 'Ihre OPs ansehen' : 'View your surgeries'}
      </a>
    </span>
  </div>
)}
```

Place this right before the form steps rendering.

**Step 2: Run dev server and verify**

Run: `npm run dev`
Navigate to `/external-surgery/:token` and verify the banner appears.

**Step 3: Commit**

```bash
git add client/src/pages/ExternalSurgeryRequest.tsx
git commit -m "feat: add surgeon portal link on external surgery request form"
```

---

### Task 9: Frontend — Admin sidebar tab for surgeon action requests

**Files:**
- Modify: `client/src/components/surgery/ExternalReservationsPanel.tsx` (add tab/section for action requests)

**Step 1: Add action requests query**

Add a new query alongside the existing surgery requests query:

```typescript
const { data: actionRequests = [], refetch: refetchActionRequests } = useQuery<any[]>({
  queryKey: [`/api/hospitals/${hospitalId}/surgeon-action-requests`, { status: 'pending' }],
  enabled: !!hospitalId,
});
```

**Step 2: Add action request count to badge**

In `ExternalRequestsBadge`, add a second query for action request count:

```typescript
const { data: actionCountData } = useQuery<{ count: number }>({
  queryKey: [`/api/hospitals/${hospitalId}/surgeon-action-requests/count`],
  enabled: !!hospitalId,
  refetchInterval: 60000,
});

const totalCount = (countData?.count || 0) + (actionCountData?.count || 0);
```

**Step 3: Add tabs to the panel**

Add a `Tabs` component to switch between "Surgery Requests" and "Surgeon Requests":

```tsx
<Tabs defaultValue="surgery-requests">
  <TabsList>
    <TabsTrigger value="surgery-requests">
      {t('Surgery Requests')} {pendingSurgeryCount > 0 && <Badge>{pendingSurgeryCount}</Badge>}
    </TabsTrigger>
    <TabsTrigger value="action-requests">
      {t('Surgeon Requests')} {pendingActionCount > 0 && <Badge>{pendingActionCount}</Badge>}
    </TabsTrigger>
  </TabsList>
  <TabsContent value="surgery-requests">{existingCardList}</TabsContent>
  <TabsContent value="action-requests">{actionRequestCards}</TabsContent>
</Tabs>
```

**Step 4: Render action request cards**

Each card shows:
- Type badge (color-coded: red=cancellation, blue=reschedule, yellow=suspension)
- Surgery info: patient name, date, room
- Surgeon email
- Reason text
- For reschedule: proposed date/time
- Two buttons: Accept / Refuse

**Step 5: Add accept/refuse mutations**

```typescript
const acceptMutation = useMutation({
  mutationFn: async (reqId: string) => {
    return apiRequest('POST', `/api/hospitals/${hospitalId}/surgeon-action-requests/${reqId}/accept`);
  },
  onSuccess: () => {
    refetchActionRequests();
    toast({ title: t("Request accepted") });
  },
});

const refuseMutation = useMutation({
  mutationFn: async ({ reqId, responseNote }: { reqId: string; responseNote?: string }) => {
    return apiRequest('POST', `/api/hospitals/${hospitalId}/surgeon-action-requests/${reqId}/refuse`, { responseNote });
  },
  onSuccess: () => {
    refetchActionRequests();
    toast({ title: t("Request refused") });
  },
});
```

**Step 6: For reschedule accept — open scheduling dialog**

When accepting a reschedule request, open a scheduling dialog (reuse or adapt `ScheduleDialog`) pre-filled with the proposed date. After scheduling, the old surgery should be archived and the request marked as accepted.

**Step 7: For refuse — show dialog with optional note**

Add a small dialog that asks for an optional refusal reason before sending the refuse mutation.

**Step 8: Run dev server and verify**

Run: `npm run dev`
Navigate to the OR calendar, open the external requests panel, verify the tabs appear.

**Step 9: Commit**

```bash
git add client/src/components/surgery/ExternalReservationsPanel.tsx
git commit -m "feat: add surgeon action requests tab to external reservations panel"
```

---

### Task 10: Integration testing and polish

**Step 1: Test full flow end-to-end**

1. Go to `/external-surgery/:token` — verify the "View your surgeries" link appears
2. Submit a surgery request — verify it appears in admin panel
3. Schedule the request from admin panel
4. Go to `/surgeon-portal/:token` — enter the surgeon email used in the request
5. Verify OTP flow works (check server logs for the code)
6. Verify the surgery appears in the calendar
7. Request cancellation — verify it appears in admin sidebar under "Surgeon Requests"
8. Accept the cancellation — verify the surgery status changes to "cancelled"
9. Verify confirmation email is sent to surgeon

**Step 2: Test reschedule flow**

1. Request reschedule with proposed date from surgeon portal
2. Accept from admin — verify scheduling dialog opens pre-filled
3. Complete scheduling — verify old surgery archived, new one created
4. Verify surgeon portal shows the new surgery

**Step 3: Test suspension flow**

1. Request suspension from surgeon portal
2. Accept from admin — verify `isSuspended` is set on surgery
3. Verify portal shows suspended status

**Step 4: Edge cases**

- Verify duplicate request prevention (same surgery + same type = 409)
- Verify surgeon sees only their surgeries (not other surgeons')
- Verify cancelled/archived surgeries don't show in portal
- Verify badge count updates after accept/refuse

**Step 5: Run TypeScript check and lint**

Run: `npm run check`

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: polish and fix surgeon portal integration"
```

---

### Dependencies between tasks

```
Task 1 (Schema) → Task 2 (Storage) → Task 3 (Auth) → Task 4 (Portal API) → Task 7 (Portal Frontend)
                                    → Task 5 (Admin API) → Task 9 (Admin Frontend)
                                    → Task 6 (Emails)
Task 8 (Request form link) — independent, can run anytime after Task 1
Task 10 (Testing) — after all other tasks
```

Tasks 4, 5, 6 can be done in parallel after Task 3.
Tasks 7, 8, 9 can be done in parallel after their API dependencies.
